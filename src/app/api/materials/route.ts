import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toObsoleteFlag(value: unknown): boolean {
  if (typeof value === "number") return value === 1;

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return ["1", "true", "si", "yes", "x", "obsoleto", "obsolete"].includes(normalized);
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const db = getDb();

  const rows = db.prepare(`
    SELECT
      m.codice, m.descrizione, m.categoria, m.raggr, m.um,
      m.prezzo_listino, m.prezzo_riservato, m.prezzo_pubblico,
      m.pz_confezione, m.mq_confezione, m.pz_bancale, m.mq_bancale,
      m.nota, m.obsoleto,
      e.descrizione_ai
    FROM materials m
    LEFT JOIN enriched_materials e ON e.codice = m.codice
    ORDER BY m.codice
  `).all() as {
    codice: string; descrizione: string; categoria: string; raggr: string; um: string;
    prezzo_listino: number; prezzo_riservato: number; prezzo_pubblico: number;
    pz_confezione: number; mq_confezione: number | null; pz_bancale: number | null; mq_bancale: number | null;
    nota: string; obsoleto: number | string; descrizione_ai: string | null;
  }[];

  const materials = rows.map((r) => ({
    codice: r.codice,
    descrizione: r.descrizione,
    ...(r.descrizione_ai ? { descrizioneAI: r.descrizione_ai } : {}),
    categoria: r.categoria,
    raggr: r.raggr,
    um: r.um,
    prezzoListino: r.prezzo_listino,
    prezzoRiservato: r.prezzo_riservato,
    prezzoPublico: r.prezzo_pubblico,
    pzConfezione: r.pz_confezione,
    ...(r.mq_confezione !== null ? { mqConfezione: r.mq_confezione } : {}),
    ...(r.pz_bancale !== null ? { pzBancale: r.pz_bancale } : {}),
    ...(r.mq_bancale !== null ? { mqBancale: r.mq_bancale } : {}),
    nota: r.nota,
    obsoleto: toObsoleteFlag(r.obsoleto),
  }));

  return NextResponse.json(
    { materials },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
