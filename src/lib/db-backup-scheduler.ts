import { createDatabaseBackup } from "@/lib/db-backup";
import { isS3BackupConfigured, uploadBackupFileToS3 } from "@/lib/db-backup-s3";

const DEFAULT_INTERVAL_MINUTES = 360;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 10080;

let schedulerStarted = false;
let cycleRunning = false;
let intervalTimer: NodeJS.Timeout | null = null;

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntervalMinutes(): number {
  const parsed = Number.parseInt(process.env.DB_BACKUP_AUTO_INTERVAL_MINUTES ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTERVAL_MINUTES;
  }

  return Math.min(Math.max(parsed, MIN_INTERVAL_MINUTES), MAX_INTERVAL_MINUTES);
}

function isAutoBackupEnabled(): boolean {
  return parseBoolean(process.env.DB_BACKUP_AUTO_ENABLED, true);
}

function shouldUploadToS3(): boolean {
  return parseBoolean(process.env.DB_BACKUP_AUTO_UPLOAD_TO_S3, true);
}

async function runBackupCycle(trigger: "startup" | "interval" | "manual") {
  if (cycleRunning) {
    console.warn("[db-backup] Ciclo backup già in esecuzione, skip trigger:", trigger);
    return;
  }

  cycleRunning = true;

  try {
    const backup = await createDatabaseBackup();
    let uploadInfo = "";

    if (shouldUploadToS3() && isS3BackupConfigured()) {
      const uploaded = await uploadBackupFileToS3(backup.fileName);
      uploadInfo = `, uploaded to s3://${uploaded.bucket}/${uploaded.key}`;
    }

    console.info(`[db-backup] Backup automatico completato (${trigger}): ${backup.fileName}${uploadInfo}`);
  } catch (error) {
    console.error("[db-backup] Errore ciclo backup automatico:", error);
  } finally {
    cycleRunning = false;
  }
}

export async function runDatabaseBackupCycleNow() {
  await runBackupCycle("manual");
}

export function ensureDatabaseBackupSchedulerStarted() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (!isAutoBackupEnabled()) {
    console.info("[db-backup] Scheduler backup automatico disattivato (DB_BACKUP_AUTO_ENABLED=false)");
    return;
  }

  const intervalMinutes = parseIntervalMinutes();
  const intervalMs = intervalMinutes * 60 * 1000;

  intervalTimer = setInterval(() => {
    void runBackupCycle("interval");
  }, intervalMs);

  intervalTimer.unref?.();

  const runOnStart = parseBoolean(process.env.DB_BACKUP_AUTO_RUN_ON_START, true);
  console.info(
    `[db-backup] Scheduler backup avviato: ogni ${intervalMinutes} minuti` +
      (shouldUploadToS3() ? " (upload S3 attivo se configurato)" : "")
  );

  if (runOnStart) {
    void runBackupCycle("startup");
  }
}

export function isDatabaseBackupSchedulerRunning(): boolean {
  return intervalTimer !== null;
}
