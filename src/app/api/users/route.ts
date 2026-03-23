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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const db = getDb();
  const users = db
    .prepare("SELECT id, username, role, email, created_at FROM users ORDER BY id")
    .all() as Omit<DbUser, "password">[];

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const body = await request.json();
  const { username, password, role, email } = body as {
    username?: string;
    password?: string;
    role?: string;
    email?: string;
  };

  if (!username || !password || !role) {
    return NextResponse.json(
      { error: "Username, password e ruolo sono obbligatori" },
      { status: 400 }
    );
  }

  if (role !== "admin" && role !== "agente") {
    return NextResponse.json({ error: "Ruolo non valido (admin o agente)" }, { status: 400 });
  }

  if (username.length < 3) {
    return NextResponse.json(
      { error: "Username deve avere almeno 3 caratteri" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password deve avere almeno 6 caratteri" },
      { status: 400 }
    );
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return NextResponse.json({ error: "Username già in uso" }, { status: 409 });
  }

  const hash = hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)")
    .run(username, hash, role, email ?? "");

  return NextResponse.json(
    { user: { id: result.lastInsertRowid, username, role, email: email ?? "" } },
    { status: 201 }
  );
}
