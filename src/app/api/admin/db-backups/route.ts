import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { createDatabaseBackup, listDatabaseBackups } from "@/lib/db-backup";
import { isS3BackupConfigured, uploadBackupFileToS3 } from "@/lib/db-backup-s3";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;

  return payload;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const backups = listDatabaseBackups();
  return NextResponse.json({ backups });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { uploadToS3?: boolean } | null;
    const uploadToS3 = Boolean(body?.uploadToS3);

    if (uploadToS3 && !isS3BackupConfigured()) {
      return NextResponse.json({ error: "Configurazione S3 backup non presente" }, { status: 400 });
    }

    const backup = await createDatabaseBackup();
    const s3 = uploadToS3 ? await uploadBackupFileToS3(backup.fileName) : null;

    return NextResponse.json({ backup, s3 }, { status: 201 });
  } catch (error) {
    console.error("[db-backup] Errore creazione backup:", error);
    return NextResponse.json({ error: "Errore durante la creazione del backup" }, { status: 500 });
  }
}
