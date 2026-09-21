import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { isValidBackupFileName, resolveBackupPath } from "@/lib/db-backup";

const DEFAULT_S3_REGION = "us-east-1";
const DEFAULT_REMOTE_MAX_FILES = 120;
const DEFAULT_FORCE_PATH_STYLE = true;
const TMP_DIR = path.join(process.cwd(), "data", "tmp");

export interface S3BackupConfig {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  maxFiles: number;
}

export interface S3BackupInfo {
  key: string;
  fileName: string;
  sizeBytes: number;
  lastModified: string;
  etag: string;
}

export interface UploadedS3BackupInfo {
  key: string;
  bucket: string;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number, maxValue: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxValue);
}

function normalizePrefix(prefix: string | undefined): string {
  const cleaned = (prefix ?? "db-backups").trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `${cleaned}/` : "";
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export function getS3BackupConfig(): S3BackupConfig | null {
  const endpointRaw = process.env.DB_BACKUP_S3_ENDPOINT?.trim();
  const bucket = process.env.DB_BACKUP_S3_BUCKET?.trim();
  const accessKeyId = process.env.DB_BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.DB_BACKUP_S3_SECRET_ACCESS_KEY?.trim();

  if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint: normalizeEndpoint(endpointRaw),
    region: process.env.DB_BACKUP_S3_REGION?.trim() || DEFAULT_S3_REGION,
    bucket,
    prefix: normalizePrefix(process.env.DB_BACKUP_S3_PREFIX),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parseBoolean(
      process.env.DB_BACKUP_S3_FORCE_PATH_STYLE,
      DEFAULT_FORCE_PATH_STYLE
    ),
    maxFiles: parsePositiveInt(process.env.DB_BACKUP_S3_MAX_FILES, DEFAULT_REMOTE_MAX_FILES, 5000),
  };
}

export function isS3BackupConfigured(): boolean {
  return getS3BackupConfig() !== null;
}

function createS3Client(config: S3BackupConfig) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function toS3Key(fileName: string, config: S3BackupConfig): string {
  return `${config.prefix}${fileName}`;
}

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function sanitizeS3Key(rawKey: string, config: S3BackupConfig): string {
  const key = rawKey.trim().replace(/^\/+/, "");
  if (!key) {
    throw new Error("Chiave S3 non valida");
  }

  if (config.prefix && !key.startsWith(config.prefix)) {
    throw new Error("Chiave S3 fuori dal prefisso consentito");
  }

  const fileName = path.posix.basename(key);
  if (!isValidBackupFileName(fileName)) {
    throw new Error("Nome file backup su S3 non valido");
  }

  return key;
}

async function listAllS3Backups(client: S3Client, config: S3BackupConfig): Promise<S3BackupInfo[]> {
  const backups: S3BackupInfo[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) continue;

      const fileName = path.posix.basename(object.Key);
      if (!isValidBackupFileName(fileName)) continue;

      backups.push({
        key: object.Key,
        fileName,
        sizeBytes: Number(object.Size ?? 0),
        lastModified: (object.LastModified ?? new Date(0)).toISOString(),
        etag: (object.ETag ?? "").replace(/"/g, ""),
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  backups.sort((a, b) => {
    const byDate = new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    if (byDate !== 0) return byDate;
    return b.key.localeCompare(a.key);
  });

  return backups;
}

async function pruneRemoteBackups(client: S3Client, config: S3BackupConfig) {
  const backups = await listAllS3Backups(client, config);
  if (backups.length <= config.maxFiles) return;

  const staleObjects = backups.slice(config.maxFiles).map((backup) => ({ Key: backup.key }));
  const chunkSize = 1000;

  for (let i = 0; i < staleObjects.length; i += chunkSize) {
    const chunk = staleObjects.slice(i, i + chunkSize);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: chunk, Quiet: true },
      })
    );
  }
}

export async function listS3Backups(limit = 100): Promise<S3BackupInfo[]> {
  const config = getS3BackupConfig();
  if (!config) {
    throw new Error("Configurazione S3 backup non presente");
  }

  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const client = createS3Client(config);
  const backups = await listAllS3Backups(client, config);
  return backups.slice(0, safeLimit);
}

export async function uploadBackupFileToS3(fileName: string): Promise<UploadedS3BackupInfo> {
  const config = getS3BackupConfig();
  if (!config) {
    throw new Error("Configurazione S3 backup non presente");
  }

  const localPath = resolveBackupPath(fileName);
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error("Backup locale non trovato");
  }

  const key = toS3Key(fileName, config);
  const client = createS3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: "application/x-sqlite3",
    })
  );

  await pruneRemoteBackups(client, config);

  return {
    key,
    bucket: config.bucket,
  };
}

export async function downloadS3BackupToTempFile(rawKey: string): Promise<{ key: string; fileName: string; tempFilePath: string }> {
  const config = getS3BackupConfig();
  if (!config) {
    throw new Error("Configurazione S3 backup non presente");
  }

  const key = sanitizeS3Key(rawKey, config);
  const fileName = path.posix.basename(key);

  ensureTmpDir();
  const tempFilePath = path.join(
    TMP_DIR,
    `s3-restore-${Date.now()}-${randomBytes(4).toString("hex")}.db`
  );

  const client = createS3Client(config);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error("Oggetto S3 senza contenuto");
  }

  if (response.Body instanceof Readable) {
    await pipeline(response.Body, fs.createWriteStream(tempFilePath));
  } else if (typeof (response.Body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (response.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    fs.writeFileSync(tempFilePath, Buffer.from(bytes));
  } else {
    throw new Error("Formato stream S3 non supportato");
  }

  return {
    key,
    fileName,
    tempFilePath,
  };
}
