import fs from "fs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { deleteDatabaseBackup, resolveBackupPath } from "@/lib/db-backup";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;

  return payload;
}

function resolveSafeBackupPath(rawFileName: string): { fileName: string; filePath: string } | null {
  let decodedFileName = "";
  try {
    decodedFileName = decodeURIComponent(rawFileName);
  } catch {
    return null;
  }

  const filePath = resolveBackupPath(decodedFileName);
  if (!filePath) return null;

  return { fileName: decodedFileName, filePath };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const { filename } = await params;
  const resolved = resolveSafeBackupPath(filename);
  if (!resolved) {
    return NextResponse.json({ error: "Nome file backup non valido" }, { status: 400 });
  }

  if (!fs.existsSync(resolved.filePath)) {
    return NextResponse.json({ error: "Backup non trovato" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(resolved.filePath);
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=${resolved.fileName}`,
      "Content-Length": String(fileBuffer.byteLength),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const { filename } = await params;
  const resolved = resolveSafeBackupPath(filename);
  if (!resolved) {
    return NextResponse.json({ error: "Nome file backup non valido" }, { status: 400 });
  }

  const deleted = deleteDatabaseBackup(resolved.fileName);
  if (!deleted) {
    return NextResponse.json({ error: "Backup non trovato" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
