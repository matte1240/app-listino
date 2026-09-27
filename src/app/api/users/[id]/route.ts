import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME, signToken, setSessionCookie } from "@/lib/auth";
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

function countAdmins(db: ReturnType<typeof getDb>): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n;
}

const LAST_ADMIN_ERROR = "Deve restare almeno un amministratore";

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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const { username, password, role, fullName, full_name, email } = body as {
    username?: string;
    password?: string;
    role?: string;
    fullName?: string;
    full_name?: string;
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
  const newRole = (role || existing.role) as DbUser["role"]; // già validato sopra
  // Un admin non può togliersi il ruolo da solo e l'app non deve mai restare senza amministratori.
  if (newRole !== existing.role) {
    if (userId === admin.id) {
      return NextResponse.json({ error: "Non puoi cambiare il tuo ruolo" }, { status: 400 });
    }
    if (existing.role === "admin" && countAdmins(db) <= 1) {
      return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
    }
  }
  const newPassword = password ? hashSync(password, 10) : existing.password;
  // Nuova password: le sessioni già aperte con la vecchia (altri dispositivi compresi) vengono chiuse.
  const newSessionVersion = password ? (existing.session_version ?? 0) + 1 : existing.session_version ?? 0;
  const submittedFullName = fullName ?? full_name;
  const newFullName = submittedFullName !== undefined ? submittedFullName.trim() : existing.full_name;
  const newEmail = email ?? existing.email;

  db.prepare("UPDATE users SET username = ?, password = ?, role = ?, full_name = ?, email = ?, session_version = ? WHERE id = ?").run(
    newUsername,
    newPassword,
    newRole,
    newFullName,
    newEmail,
    newSessionVersion,
    userId
  );

  const updatedUser = { id: userId, username: newUsername, fullName: newFullName || newUsername, role: newRole, email: newEmail };
  const response = NextResponse.json({ user: updatedUser });
  // L'admin che cambia la propria password resta collegato su questo dispositivo con un token aggiornato.
  if (userId === admin.id && newSessionVersion !== existing.session_version) {
    setSessionCookie(response, await signToken(updatedUser, newSessionVersion));
  }
  return response;
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
  const existing = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as Pick<DbUser, "role"> | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }
  if (existing.role === "admin" && countAdmins(db) <= 1) {
    return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);

  return NextResponse.json({ ok: true });
}
