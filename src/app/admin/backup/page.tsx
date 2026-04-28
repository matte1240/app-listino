"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CloudUpload,
  ChevronRight,
  Clock3,
  Database,
  Download,
  HardDrive,
  Loader2,
  RotateCcw,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const DEFAULT_VISIBLE_BACKUPS = 5;

interface BackupItem {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

interface S3BackupItem {
  key: string;
  fileName: string;
  sizeBytes: number;
  lastModified: string;
  etag: string;
}

interface LocalBackupsResponse {
  backups?: BackupItem[];
  error?: string;
}

interface S3BackupsResponse {
  configured?: boolean;
  backups?: S3BackupItem[];
  error?: string;
}

interface RestoreResponse {
  restore?: {
    restoredFrom?: string;
    restoredAt?: string;
    safetyBackup?: { fileName?: string } | null;
  };
  error?: string;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export default function AdminBackupPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingS3, setCreatingS3] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [restoringLocalFile, setRestoringLocalFile] = useState<string | null>(null);
  const [restoringS3Key, setRestoringS3Key] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [s3Configured, setS3Configured] = useState(false);
  const [s3Backups, setS3Backups] = useState<S3BackupItem[]>([]);
  const [showAllLocalBackups, setShowAllLocalBackups] = useState(false);
  const [showAllS3Backups, setShowAllS3Backups] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/");
    }
  }, [authLoading, isAdmin, router]);

  async function fetchBackups(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [localResponse, s3Response] = await Promise.all([
        fetch("/api/admin/db-backups", { cache: "no-store" }),
        fetch("/api/admin/db-backups/s3?limit=100", { cache: "no-store" }),
      ]);

      const localData = await parseJson<LocalBackupsResponse>(localResponse);
      if (!localResponse.ok) {
        throw new Error(localData?.error ?? "Impossibile caricare i backup locali");
      }
      setBackups(Array.isArray(localData?.backups) ? localData.backups : []);

      const s3Data = await parseJson<S3BackupsResponse>(s3Response);
      if (!s3Response.ok) {
        throw new Error(s3Data?.error ?? "Impossibile caricare i backup S3");
      }

      setS3Configured(Boolean(s3Data?.configured));
      setS3Backups(Array.isArray(s3Data?.backups) ? s3Data.backups : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il caricamento dei backup");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!authLoading && isAdmin) {
      void fetchBackups();
    }
  }, [authLoading, isAdmin]);

  async function handleCreateBackup() {
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/db-backups", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Creazione backup non riuscita");
      }

      setSuccess("Backup locale creato correttamente");
      await fetchBackups(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la creazione del backup");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateAndUploadS3Backup() {
    setCreatingS3(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/db-backups/s3", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Backup S3 non riuscito");
      }

      setSuccess("Backup creato e caricato su S3");
      await fetchBackups(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il backup su S3");
    } finally {
      setCreatingS3(false);
    }
  }

  async function handleDeleteBackup(fileName: string) {
    if (!window.confirm(`Eliminare il backup ${fileName}?`)) return;

    setDeletingFile(fileName);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/db-backups/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Eliminazione backup non riuscita");
      }

      setBackups((prev) => prev.filter((backup) => backup.fileName !== fileName));
      setSuccess(`Backup ${fileName} eliminato`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione del backup");
    } finally {
      setDeletingFile(null);
    }
  }

  async function handleRestoreLocalBackup(fileName: string) {
    const confirmed = window.confirm(
      `Ripristinare il DB dal backup locale ${fileName}? Verrà creato prima un backup di sicurezza automatico.`
    );
    if (!confirmed) return;

    setRestoringLocalFile(fileName);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/db-backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "local", fileName }),
      });

      const data = await parseJson<RestoreResponse>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Restore locale non riuscito");
      }

      const safetyBackupName = data?.restore?.safetyBackup?.fileName;
      setSuccess(
        safetyBackupName
          ? `Restore completato da ${fileName}. Backup sicurezza: ${safetyBackupName}`
          : `Restore completato da ${fileName}`
      );

      await fetchBackups(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il restore locale");
    } finally {
      setRestoringLocalFile(null);
    }
  }

  async function handleRestoreS3Backup(item: S3BackupItem) {
    const confirmed = window.confirm(
      `Ripristinare il DB dal backup S3 ${item.fileName}? Verrà creato prima un backup di sicurezza automatico.`
    );
    if (!confirmed) return;

    setRestoringS3Key(item.key);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/db-backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "s3", key: item.key }),
      });

      const data = await parseJson<RestoreResponse>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Restore da S3 non riuscito");
      }

      const safetyBackupName = data?.restore?.safetyBackup?.fileName;
      setSuccess(
        safetyBackupName
          ? `Restore da S3 completato. Backup sicurezza: ${safetyBackupName}`
          : "Restore da S3 completato"
      );

      await fetchBackups(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il restore da S3");
    } finally {
      setRestoringS3Key(null);
    }
  }

  const totalSize = useMemo(
    () => backups.reduce((sum, backup) => sum + (Number.isFinite(backup.sizeBytes) ? backup.sizeBytes : 0), 0),
    [backups]
  );

  const totalS3Size = useMemo(
    () => s3Backups.reduce((sum, backup) => sum + (Number.isFinite(backup.sizeBytes) ? backup.sizeBytes : 0), 0),
    [s3Backups]
  );

  const visibleLocalBackups = useMemo(
    () =>
      showAllLocalBackups
        ? backups
        : backups.slice(0, DEFAULT_VISIBLE_BACKUPS),
    [backups, showAllLocalBackups]
  );

  const visibleS3Backups = useMemo(
    () =>
      showAllS3Backups
        ? s3Backups
        : s3Backups.slice(0, DEFAULT_VISIBLE_BACKUPS),
    [s3Backups, showAllS3Backups]
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">
            Admin
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Backup DB</span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-bold text-lg">Backup database</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crea snapshot consistenti del database SQLite e scaricali per conservazione esterna.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchBackups(true)}
              disabled={refreshing || creating || creatingS3}
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Aggiorna
            </Button>

            <Button type="button" size="sm" onClick={handleCreateBackup} disabled={creating || creatingS3 || refreshing}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Nuovo backup
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCreateAndUploadS3Backup}
              disabled={!s3Configured || creating || creatingS3 || refreshing}
            >
              {creatingS3 ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Backup + S3
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="h-4 w-4" />
            <span>Backup presenti: <strong className="text-foreground">{backups.length}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            <span>Spazio totale: <strong className="text-foreground">{formatBytes(totalSize)}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudUpload className="h-4 w-4" />
            <span>
              S3 Hetzner: <strong className="text-foreground">{s3Configured ? `${s3Backups.length} file` : "non configurato"}</strong>
            </span>
          </div>
        </div>

        {success && (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!s3Configured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
            Backup S3 non configurato: imposta le variabili `DB_BACKUP_S3_*` per abilitare upload automatici su Hetzner Object Storage.
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card divide-y">
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">Backup locali</h2>
              {backups.length > DEFAULT_VISIBLE_BACKUPS && !showAllLocalBackups && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mostrati ultimi {DEFAULT_VISIBLE_BACKUPS} di {backups.length}.
                </p>
              )}
            </div>
            {backups.length > DEFAULT_VISIBLE_BACKUPS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllLocalBackups((prev) => !prev)}
              >
                {showAllLocalBackups ? "Mostra meno" : "Mostra tutti"}
              </Button>
            )}
          </div>

          {backups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nessun backup disponibile. Crea il primo backup con il pulsante in alto.
            </div>
          ) : (
            visibleLocalBackups.map((backup) => (
              <div
                key={backup.fileName}
                className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{backup.fileName}</p>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(backup.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HardDrive className="h-3.5 w-3.5" />
                      {formatBytes(backup.sizeBytes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/admin/db-backups/${encodeURIComponent(backup.fileName)}`}>
                      <Download className="h-4 w-4" />
                      Scarica
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRestoreLocalBackup(backup.fileName)}
                    disabled={restoringLocalFile === backup.fileName || restoringS3Key !== null}
                  >
                    {restoringLocalFile === backup.fileName ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Ripristina
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDeleteBackup(backup.fileName)}
                    disabled={deletingFile === backup.fileName || restoringLocalFile !== null || restoringS3Key !== null}
                  >
                    {deletingFile === backup.fileName ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Elimina
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card divide-y">
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">Backup remoti S3</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Oggetti salvati su Hetzner Object Storage ({formatBytes(totalS3Size)}).
              </p>
            </div>
            {s3Configured && s3Backups.length > DEFAULT_VISIBLE_BACKUPS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllS3Backups((prev) => !prev)}
              >
                {showAllS3Backups ? "Mostra meno" : "Mostra tutti"}
              </Button>
            )}
          </div>

          {!s3Configured ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nessun endpoint S3 configurato.
            </div>
          ) : s3Backups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nessun backup remoto trovato.
            </div>
          ) : (
            visibleS3Backups.map((backup) => (
              <div
                key={backup.key}
                className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{backup.fileName}</p>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(backup.lastModified)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HardDrive className="h-3.5 w-3.5" />
                      {formatBytes(backup.sizeBytes)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">{backup.key}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRestoreS3Backup(backup)}
                    disabled={restoringS3Key === backup.key || restoringLocalFile !== null}
                  >
                    {restoringS3Key === backup.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Ripristina da S3
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
