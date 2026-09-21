import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { closeDbConnection, DB_PATH, getDb } from "@/lib/db";

const DATA_DIR = path.join(process.cwd(), "data");
const TMP_DIR = path.join(DATA_DIR, "tmp");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUP_NAME_REGEX = /^listino-\d{8}-\d{6}-[a-f0-9]{6}\.db$/;
const DEFAULT_MAX_BACKUPS = 30;
const DEFAULT_RESTORE_SAFETY_BACKUPS = true;

let dbOperationQueue: Promise<unknown> = Promise.resolve();

interface BackupEntry {
  fileName: string;
  filePath: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface DatabaseBackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DatabaseRestoreInfo {
  restoredFrom: string;
  restoredAt: string;
  safetyBackup: DatabaseBackupInfo | null;
}

function enqueueDbOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = dbOperationQueue.then(operation, operation);
  dbOperationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureBackupDir() {
  ensureDataDir();
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function ensureTmpDir() {
  ensureDataDir();
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function parseMaxBackups(): number {
  const raw = process.env.DB_BACKUP_MAX_FILES;
  const parsed = Number.parseInt(raw ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_BACKUPS;
  }

  return Math.min(parsed, 5000);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildBackupFileName(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  const suffix = randomBytes(3).toString("hex");
  return `listino-${y}${m}${d}-${hh}${mm}${ss}-${suffix}.db`;
}

function toBackupInfo(entry: BackupEntry): DatabaseBackupInfo {
  return {
    fileName: entry.fileName,
    sizeBytes: entry.sizeBytes,
    createdAt: new Date(entry.mtimeMs).toISOString(),
  };
}

function readBackupEntries(): BackupEntry[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  const backups: BackupEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isValidBackupFileName(entry.name)) continue;

    const filePath = path.join(BACKUP_DIR, entry.name);
    const stats = fs.statSync(filePath);

    backups.push({
      fileName: entry.name,
      filePath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
    });
  }

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs || b.fileName.localeCompare(a.fileName));
  return backups;
}

function pruneBackups(maxBackups: number) {
  const backups = readBackupEntries();
  if (backups.length <= maxBackups) return;

  const staleBackups = backups.slice(maxBackups);
  for (const backup of staleBackups) {
    try {
      fs.unlinkSync(backup.filePath);
    } catch (error) {
      console.warn("[db-backup] Impossibile eliminare backup obsoleto:", backup.fileName, error);
    }
  }
}

export function isValidBackupFileName(fileName: string): boolean {
  return BACKUP_NAME_REGEX.test(fileName);
}

export function resolveBackupPath(fileName: string): string | null {
  if (!isValidBackupFileName(fileName)) return null;
  return path.join(BACKUP_DIR, fileName);
}

export function listDatabaseBackups(): DatabaseBackupInfo[] {
  return readBackupEntries().map(toBackupInfo);
}

function removeFileIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  fs.unlinkSync(filePath);
}

function cleanupSqliteSidecars(basePath: string) {
  removeFileIfExists(`${basePath}-wal`);
  removeFileIfExists(`${basePath}-shm`);
}

function validateSqliteFile(filePath: string) {
  const probe = new Database(filePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const integrity = probe.prepare("PRAGMA integrity_check").pluck().get() as string | undefined;
    if (integrity !== "ok") {
      throw new Error(`integrity_check non valido: ${integrity ?? "sconosciuto"}`);
    }
  } finally {
    probe.close();
  }
}

async function createDatabaseBackupInternal(): Promise<DatabaseBackupInfo> {
  ensureBackupDir();

  const fileName = buildBackupFileName();
  const backupPath = path.join(BACKUP_DIR, fileName);

  const db = getDb();
  await db.backup(backupPath);

  pruneBackups(parseMaxBackups());

  const stats = fs.statSync(backupPath);
  return {
    fileName,
    sizeBytes: stats.size,
    createdAt: stats.mtime.toISOString(),
  };
}

export async function createDatabaseBackup(): Promise<DatabaseBackupInfo> {
  return enqueueDbOperation(async () => createDatabaseBackupInternal());
}

interface RestoreOptions {
  createSafetyBackup?: boolean;
}

async function restoreDatabaseFromFileInternal(
  sourceFilePath: string,
  sourceLabel: string,
  options?: RestoreOptions
): Promise<DatabaseRestoreInfo> {
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error("Backup sorgente non trovato");
  }

  validateSqliteFile(sourceFilePath);

  const shouldCreateSafetyBackup = options?.createSafetyBackup ?? DEFAULT_RESTORE_SAFETY_BACKUPS;
  const safetyBackup = shouldCreateSafetyBackup ? await createDatabaseBackupInternal() : null;

  ensureTmpDir();

  const incomingPath = path.join(
    TMP_DIR,
    `restore-${Date.now()}-${randomBytes(4).toString("hex")}.db`
  );
  const previousPath = `${DB_PATH}.previous`;
  let swapped = false;

  fs.copyFileSync(sourceFilePath, incomingPath);
  validateSqliteFile(incomingPath);

  try {
    closeDbConnection();
    cleanupSqliteSidecars(DB_PATH);

    removeFileIfExists(previousPath);
    cleanupSqliteSidecars(previousPath);

    if (fs.existsSync(DB_PATH)) {
      fs.renameSync(DB_PATH, previousPath);
    }

    fs.renameSync(incomingPath, DB_PATH);
    swapped = true;

    const db = getDb();
    const integrity = db.prepare("PRAGMA integrity_check").pluck().get() as string | undefined;
    if (integrity !== "ok") {
      throw new Error(`Restore fallito: integrity_check=${integrity ?? "sconosciuto"}`);
    }

    removeFileIfExists(previousPath);
    cleanupSqliteSidecars(previousPath);

    return {
      restoredFrom: sourceLabel,
      restoredAt: new Date().toISOString(),
      safetyBackup,
    };
  } catch (error) {
    closeDbConnection();

    try {
      if (swapped) {
        removeFileIfExists(DB_PATH);
        cleanupSqliteSidecars(DB_PATH);
      }

      if (fs.existsSync(previousPath)) {
        fs.renameSync(previousPath, DB_PATH);
      }
    } catch (rollbackError) {
      console.error("[db-backup] Errore durante rollback restore:", rollbackError);
    }

    try {
      getDb();
    } catch (reopenError) {
      console.error("[db-backup] Errore riapertura DB dopo rollback:", reopenError);
    }

    throw error;
  } finally {
    removeFileIfExists(incomingPath);
    cleanupSqliteSidecars(incomingPath);
  }
}

export async function restoreDatabaseFromFile(
  sourceFilePath: string,
  sourceLabel: string,
  options?: RestoreOptions
): Promise<DatabaseRestoreInfo> {
  return enqueueDbOperation(async () => restoreDatabaseFromFileInternal(sourceFilePath, sourceLabel, options));
}

export async function restoreDatabaseFromLocalBackup(
  fileName: string,
  options?: RestoreOptions
): Promise<DatabaseRestoreInfo> {
  const backupPath = resolveBackupPath(fileName);
  if (!backupPath) {
    throw new Error("Nome file backup non valido");
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error("Backup non trovato");
  }

  return restoreDatabaseFromFile(backupPath, fileName, options);
}

export function deleteDatabaseBackup(fileName: string): boolean {
  const backupPath = resolveBackupPath(fileName);
  if (!backupPath || !fs.existsSync(backupPath)) return false;

  fs.unlinkSync(backupPath);
  return true;
}
