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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const anagraficaId = Number.parseInt(id, 10);
  if (!Number.isInteger(anagraficaId) || anagraficaId <= 0) {
    return NextResponse.json({ error: "ID non valido" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, codice, ragione_sociale, indirizzo, cap_citta, piva
       FROM anagrafiche
       WHERE id = ?`
    )
    .get(anagraficaId) as DbAnagraficaRow | undefined;

  if (!row) return NextResponse.json({ error: "Anagrafica non trovata" }, { status: 404 });
  return NextResponse.json({ anagrafica: dbToAnagrafica(row) });
}