import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Anagrafica } from "@/types";

interface DbAnagraficaRow {
  id: number;
  codice: string;
  ragione_sociale: string;
  indirizzo: string;
  cap_citta: string;
  piva: string;
  sede_legale: string;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function dbToAnagrafica(row: DbAnagraficaRow): Anagrafica {
  return {
    id: row.id,
    codice: row.codice,
    ragioneSociale: row.ragione_sociale,
    indirizzo: row.indirizzo,
    capCitta: row.cap_citta,
    partitaIva: row.piva,
    sedeLegale: row.sede_legale,
  };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 1000)) : 50;

  const db = getDb();

  let rows: DbAnagraficaRow[] = [];
  if (!q) {
    rows = db
      .prepare(
        `SELECT id, codice, ragione_sociale, indirizzo, cap_citta, piva, sede_legale
         FROM anagrafiche
         ORDER BY ragione_sociale ASC
         LIMIT ?`
      )
      .all(limit) as DbAnagraficaRow[];
  } else {
    const qLower = normalizeSearch(q);
    const exact = qLower;
    const prefix = `${qLower}%`;
    const contains = `%${qLower}%`;

    rows = db
      .prepare(
        `SELECT id, codice, ragione_sociale, indirizzo, cap_citta, piva, sede_legale
         FROM anagrafiche
         WHERE lower(codice) LIKE ?
            OR lower(ragione_sociale) LIKE ?
            OR lower(search_text) LIKE ?
         ORDER BY
           CASE
             WHEN lower(codice) = ? THEN 0
             WHEN lower(codice) LIKE ? THEN 1
             WHEN lower(ragione_sociale) LIKE ? THEN 2
             WHEN lower(ragione_sociale) LIKE ? THEN 3
             ELSE 4
           END,
           ragione_sociale ASC
         LIMIT ?`
      )
      .all(contains, contains, contains, exact, prefix, prefix, contains, limit) as DbAnagraficaRow[];
  }

  return NextResponse.json({ anagrafiche: rows.map(dbToAnagrafica) });
}
