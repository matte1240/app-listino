import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { signToken, COOKIE_NAME } from "@/lib/auth";
import { compareSync } from "bcryptjs";
import type { DbUser } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: "Username e password sono obbligatori" }, { status: 400 });
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | DbUser
    | undefined;

  if (!user || !compareSync(password, user.password)) {
    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }

  const token = await signToken({ id: user.id, username: user.username, role: user.role });

  const response = NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role },
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return response;
}
