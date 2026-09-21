import fs from "fs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { restoreDatabaseFromFile, restoreDatabaseFromLocalBackup } from "@/lib/db-backup";
import { downloadS3BackupToTempFile, isS3BackupConfigured } from "@/lib/db-backup-s3";

export const dynamic = "force-dynamic";

type RestoreSource = "local" | "s3";

interface RestoreBody {
  source?: RestoreSource;
  fileName?: string;
  key?: string;
  createSafetyBackup?: boolean;
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;

  return payload;
}

function mapErrorToStatus(error: unknown): number {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("non trovato")) return 404;
  if (message.includes("non valido")) return 400;
  if (message.includes("configurazione")) return 400;
  return 500;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as RestoreBody | null;
  const source = body?.source;
  const createSafetyBackup = body?.createSafetyBackup !== false;

  if (source !== "local" && source !== "s3") {
    return NextResponse.json({ error: "Sorgente restore non valida" }, { status: 400 });
  }

  try {
    if (source === "local") {
      if (!body?.fileName) {
        return NextResponse.json({ error: "fileName mancante" }, { status: 400 });
      }

      const restore = await restoreDatabaseFromLocalBackup(body.fileName, { createSafetyBackup });
      return NextResponse.json({ restore });
    }

    if (!isS3BackupConfigured()) {
      return NextResponse.json({ error: "Configurazione S3 backup non presente" }, { status: 400 });
    }

    if (!body?.key) {
      return NextResponse.json({ error: "key mancante" }, { status: 400 });
    }

    const downloaded = await downloadS3BackupToTempFile(body.key);

    try {
      const restore = await restoreDatabaseFromFile(downloaded.tempFilePath, downloaded.key, {
        createSafetyBackup,
      });
      return NextResponse.json({ restore });
    } finally {
      if (fs.existsSync(downloaded.tempFilePath)) {
        fs.unlinkSync(downloaded.tempFilePath);
      }
    }
  } catch (error) {
    console.error("[db-backup] Errore restore:", error);
    const status = mapErrorToStatus(error);
    const message = error instanceof Error ? error.message : "Errore durante il restore del database";
    return NextResponse.json({ error: message }, { status });
  }
}
