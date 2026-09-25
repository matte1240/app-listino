import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { signToken, COOKIE_NAME } from "@/lib/auth";
import { compareSync } from "bcryptjs";
import type { DbUser } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { username: rawUsername, password } = (body ?? {}) as { username?: string; password?: string };
  // Le tastiere dei tablet aggiungono spazi dopo i suggerimenti e la maiuscola iniziale.
  const username = typeof rawUsername === "string" ? rawUsername.trim() : "";

  if (!username || typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Username e password sono obbligatori" }, { status: 400 });
  }

  const db = getDb();
  // Prima il nome esatto; senza maiuscole/minuscole solo se individua un unico utente.
  let user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as DbUser | undefined;
  if (!user) {
    const matches = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 2").all(username) as DbUser[];
    if (matches.length === 1) user = matches[0];
  }

  if (!user || !compareSync(password, user.password)) {
    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }

  const fullName = user.full_name || user.username;
  const token = await signToken({ id: user.id, username: user.username, role: user.role, fullName, email: user.email });

  const response = NextResponse.json({
    user: { id: user.id, username: user.username, fullName, role: user.role, email: user.email },
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return response;
}
