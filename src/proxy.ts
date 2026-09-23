import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production"
);

const COOKIE_NAME = "listino-token";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health", "/manifest.webmanifest"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths, static assets, Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?|webmanifest|json)$/)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  // Le API rispondono 401 in JSON: un redirect verso /login farebbe arrivare HTML a chi si aspetta JSON.
  const isApi = pathname.startsWith("/api/");

  if (!token) {
    if (isApi) return unauthorizedApiResponse();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const response = NextResponse.next();
    response.headers.set("x-user-id", String(payload.id));
    response.headers.set("x-user-role", String(payload.role));
    response.headers.set("x-user-name", String(payload.username));
    return response;
  } catch {
    // Invalid token — clear cookie and redirect to login
    const response = isApi ? unauthorizedApiResponse() : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  }
}

function unauthorizedApiResponse() {
  return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};