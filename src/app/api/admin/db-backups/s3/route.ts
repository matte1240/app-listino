import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { createDatabaseBackup } from "@/lib/db-backup";
import { isS3BackupConfigured, listS3Backups, uploadBackupFileToS3 } from "@/lib/db-backup-s3";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;

  return payload;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const configured = isS3BackupConfigured();
  if (!configured) {
    return NextResponse.json({ configured: false, backups: [] });
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;

    const backups = await listS3Backups(safeLimit);
    return NextResponse.json({ configured: true, backups });
  } catch (error) {
    console.error("[db-backup] Errore lettura backup S3:", error);
    return NextResponse.json({ error: "Errore durante lettura backup S3" }, { status: 500 });
  }
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  if (!isS3BackupConfigured()) {
    return NextResponse.json({ error: "Configurazione S3 backup non presente" }, { status: 400 });
  }

  try {
    const backup = await createDatabaseBackup();
    const s3 = await uploadBackupFileToS3(backup.fileName);
    return NextResponse.json({ backup, s3 }, { status: 201 });
  } catch (error) {
    console.error("[db-backup] Errore backup+upload S3:", error);
    return NextResponse.json({ error: "Errore durante il backup su S3" }, { status: 500 });
  }
}
