import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hashSync } from "bcryptjs";
import type { DbUser } from "@/lib/db";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID non valido" }, { status: 400 });
  }

  const body = await request.json();
  const { username, password, role, email } = body as {
    username?: string;
    password?: string;
    role?: string;
    email?: string;
  };

  if (role && role !== "admin" && role !== "agente") {
    return NextResponse.json({ error: "Ruolo non valido (admin o agente)" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | DbUser
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  if (username && username !== existing.username) {
    const dup = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, userId);
    if (dup) {
      return NextResponse.json({ error: "Username già in uso" }, { status: 409 });
    }
  }

  const newUsername = username || existing.username;
  const newRole = role || existing.role;
  const newPassword = password ? hashSync(password, 10) : existing.password;
  const newEmail = email ?? existing.email;

  db.prepare("UPDATE users SET username = ?, password = ?, role = ?, email = ? WHERE id = ?").run(
    newUsername,
    newPassword,
    newRole,
    newEmail,
    userId
  );

  return NextResponse.json({ user: { id: userId, username: newUsername, role: newRole, email: newEmail } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID non valido" }, { status: 400 });
  }

  if (userId === admin.id) {
    return NextResponse.json({ error: "Non puoi eliminare te stesso" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
