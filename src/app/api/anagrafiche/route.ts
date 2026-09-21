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
}

function dbToAnagrafica(row: DbAnagraficaRow): Anagrafica {
  return {
    id: row.id,
    codice: row.codice,
    ragioneSociale: row.ragione_sociale,
    indirizzo: row.indirizzo,
    capCitta: row.cap_citta,
    partitaIva: row.piva,
  };
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limitRaw = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 30;

  const db = getDb();

  let rows: DbAnagraficaRow[] = [];

  if (!q) {
    rows = db
      .prepare(
        `SELECT id, codice, ragione_sociale, indirizzo, cap_citta, piva
         FROM anagrafiche
         ORDER BY ragione_sociale ASC
         LIMIT ?`
      )
      .all(limit) as DbAnagraficaRow[];
  } else {
    const normalizedQ = normalizeSearch(q);
    const containsNormalized = `%${normalizedQ}%`;
    const contains = `%${q}%`;
    const exact = q;
    const prefix = `${q}%`;

    rows = db
      .prepare(
        `SELECT id, codice, ragione_sociale, indirizzo, cap_citta, piva
         FROM anagrafiche
         WHERE search_text LIKE ?
            OR ragione_sociale LIKE ?
            OR codice LIKE ?
            OR piva LIKE ?
         ORDER BY
            CASE
              WHEN ragione_sociale = ? THEN 0
              WHEN ragione_sociale LIKE ? THEN 1
              WHEN codice = ? THEN 2
              ELSE 3
            END,
            ragione_sociale ASC
         LIMIT ?`
      )
      .all(
        containsNormalized,
        contains,
        contains,
        contains,
        exact,
        prefix,
        exact,
        limit
      ) as DbAnagraficaRow[];
  }

  return NextResponse.json({ anagrafiche: rows.map(dbToAnagrafica) });
}
