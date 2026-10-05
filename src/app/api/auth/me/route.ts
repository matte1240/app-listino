import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    // Token scaduto o utente eliminato: si toglie il cookie, così il proxy rimanda al login.
    const response = NextResponse.json({ error: "Token non valido" }, { status: 401 });
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  }

  return NextResponse.json({
    user: {
      id: payload.id,
      username: payload.username,
      fullName: payload.fullName || payload.username,
      role: payload.role,
      email: payload.email,
    },
  });
}
