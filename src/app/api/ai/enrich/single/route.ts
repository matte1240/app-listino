import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enrichMaterials } from "@/lib/ai-enrich";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY non configurata" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as { codice?: unknown };
  const codice = typeof body.codice === "string" ? body.codice.trim() : "";
  if (!codice) {
    return NextResponse.json({ error: "Codice articolo mancante" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT codice, descrizione FROM materials WHERE codice = ?")
    .get(codice) as { codice: string; descrizione: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
  }

  let enriched;
  try {
    enriched = await enrichMaterials([{ codice: row.codice, descrizione: row.descrizione }]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore durante l'arricchimento";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const result = enriched[0];
  if (!result) {
    return NextResponse.json({ error: "Nessun risultato dall'AI" }, { status: 502 });
  }

  db.prepare(`
    INSERT INTO enriched_materials (codice, descrizione_ai, updated_at)
    VALUES (@codice, @descrizioneAI, @updatedAt)
    ON CONFLICT(codice) DO UPDATE SET
      descrizione_ai = excluded.descrizione_ai,
      updated_at = excluded.updated_at
  `).run({
    codice: result.codice,
    descrizioneAI: result.descrizioneAI,
    updatedAt: result.updatedAt,
  });

  return NextResponse.json(
    { codice: result.codice, descrizioneAI: result.descrizioneAI, updatedAt: result.updatedAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
