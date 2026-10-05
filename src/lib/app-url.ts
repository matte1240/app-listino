import type { NextRequest } from "next/server";

/**
 * URL pubblico dell'app per i link nelle email/notifiche.
 * Priorità: env APP_URL → header del reverse proxy → origin della richiesta.
 * Dietro Docker l'origin sarebbe 127.0.0.1:3000, quindi in produzione va impostata APP_URL.
 */
export function getAppBaseUrl(req?: NextRequest): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (req) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host")?.trim();
    if (host) return `${proto || "http"}://${host}`;
    return req.nextUrl.origin;
  }

  return "";
}
