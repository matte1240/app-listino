import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { searchAddresses } from "@/lib/photon";

/** Sotto questa soglia i suggerimenti sono troppo generici per essere utili. */
const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ status: "ok", results: [] });
  }

  const limitRaw = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const result = await searchAddresses(query, limit);

  // 503 quando il servizio indirizzi non risponde: il client lo interpreta come
  // "non posso validare" e accetta il testo libero, invece di bloccare l'ordine.
  return NextResponse.json(result, {
    status: result.status === "unavailable" ? 503 : 200,
  });
}
