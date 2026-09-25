import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, type DbUser } from "@/lib/db";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production"
);

export const COOKIE_NAME = "listino-token";

export interface JwtPayload {
  id: number;
  username: string;
  role: "admin" | "agente";
  fullName: string;
  email: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

/**
 * Verifica firma e scadenza del token, poi ricarica l'utente dal DB: un utente eliminato perde
 * subito l'accesso e ruolo/nome sono quelli attuali, non quelli scritti nel token al login.
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  let payload: Partial<JwtPayload>;
  try {
    payload = (await jwtVerify(token, secret)).payload as Partial<JwtPayload>;
  } catch {
    return null;
  }
  if (typeof payload.id !== "number") return null;

  const user = getDb()
    .prepare("SELECT id, username, role, full_name, email FROM users WHERE id = ?")
    .get(payload.id) as Omit<DbUser, "password" | "created_at"> | undefined;
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name || user.username,
    email: user.email,
  };
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  return payload;
}

/** Legge e verifica il token della richiesta (route handler). */
export async function getRequestPayload(req: NextRequest): Promise<JwtPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

type AuthResult =
  | { payload: JwtPayload; error?: undefined }
  | { payload?: undefined; error: NextResponse };

/** Richiede un utente autenticato; restituisce la risposta 401 pronta se manca. */
export async function requireUser(req: NextRequest): Promise<AuthResult> {
  const payload = await getRequestPayload(req);
  if (!payload) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }
  return { payload };
}

/** Richiede un utente con ruolo admin; restituisce 401/403 pronti in caso contrario. */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const result = await requireUser(req);
  if (result.error) return result;
  if (result.payload.role !== "admin") {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }) };
  }
  return result;
}
