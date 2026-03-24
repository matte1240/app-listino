import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enrichMaterials } from "@/lib/ai-enrich";
import type { EnrichedData } from "@/types";
import {
  getEnrichState,
  startEnrichState,
  batchStart,
  batchDone,
  batchError,
  enrichDone,
  enrichError,
} from "@/lib/enrich-state";

/** GET /api/ai/enrich — retrieve enriched data + current enrichment status */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const db = getDb();
  const rows = db.prepare(`
    SELECT codice, descrizione_ai, updated_at
    FROM enriched_materials
  `).all() as Array<{
    codice: string;
    descrizione_ai: string;
    updated_at: string;
  }>;

  const enriched: Record<string, EnrichedData> = {};
  for (const r of rows) {
    enriched[r.codice] = {
      codice: r.codice,
      descrizioneAI: r.descrizione_ai,
      updatedAt: r.updated_at,
    };
  }

  const total = (db.prepare("SELECT COUNT(*) as c FROM materials").get() as { c: number }).c;

  return NextResponse.json({
    enriched,
    count: rows.length,
    total,
    enrichState: getEnrichState(),
  });
}

/** POST /api/ai/enrich — trigger AI enrichment in background (admin only) */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurata nel server" },
      { status: 500 }
    );
  }

  // Prevent double-start
  const current = getEnrichState();
  if (current.status === "running") {
    return NextResponse.json(
      { error: "Arricchimento già in corso", enrichState: current },
      { status: 409 }
    );
  }

  // Read body options
  const body = await req.json().catch(() => ({})) as { onlyMissing?: boolean };
  const onlyMissing = body.onlyMissing !== false; // default true

  // Load materials from DB
  const db = getDb();
  const totalCount = (db.prepare("SELECT COUNT(*) as c FROM materials").get() as { c: number }).c;
  if (totalCount === 0) {
    return NextResponse.json({ error: "Nessun articolo nel database. Carica prima un listino Excel." }, { status: 404 });
  }

  const allMaterials = db.prepare("SELECT codice, descrizione FROM materials ORDER BY codice")
    .all() as Array<{ codice: string; descrizione: string }>;

  let materialsToEnrich = allMaterials;
  if (onlyMissing) {
    const existing = db
      .prepare("SELECT codice FROM enriched_materials")
      .all() as Array<{ codice: string }>;
    const existingSet = new Set(existing.map((e) => e.codice));
    materialsToEnrich = allMaterials.filter((m) => !existingSet.has(m.codice));
  }

  if (materialsToEnrich.length === 0) {
    return NextResponse.json({
      message: "Tutti gli articoli sono già arricchiti",
      enrichedCount: 0,
      totalCount: allMaterials.length,
    });
  }

  const batchSize = 50;
  const totalItems = materialsToEnrich.length;
  const totalBatches = Math.ceil(totalItems / batchSize);

  // Initialize state and start background processing
  startEnrichState(totalItems, totalBatches, batchSize);

  // Fire-and-forget — runs in background
  runEnrichment(materialsToEnrich, batchSize, totalItems, totalBatches, totalCount);

  return NextResponse.json({ message: "Arricchimento avviato", enrichState: getEnrichState() }, { status: 202 });
}

/** Background enrichment — updates singleton state as it progresses */
async function runEnrichment(
  materials: Array<{ codice: string; descrizione: string }>,
  batchSize: number,
  totalItems: number,
  totalBatches: number,
  totalCount: number,
) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO enriched_materials (codice, descrizione_ai, updated_at)
    VALUES (@codice, @descrizioneAI, @updatedAt)
    ON CONFLICT(codice) DO UPDATE SET
      descrizione_ai = excluded.descrizione_ai,
      updated_at = excluded.updated_at
  `);
  const insertMany = db.transaction((items: EnrichedData[]) => {
    for (const item of items) {
      upsert.run({
        codice: item.codice,
        descrizioneAI: item.descrizioneAI,
        updatedAt: item.updatedAt,
      });
    }
  });

  let enrichedCount = 0;
  let errorCount = 0;

  try {
    for (let i = 0; i < totalItems; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = materials.slice(i, i + batchSize);

      batchStart(batchNum, totalBatches, batch.length, batch[0]?.codice ?? "");

      try {
        const enriched = await enrichMaterials(batch);
        insertMany(enriched);
        enrichedCount += enriched.length;
        batchDone(batchNum, totalBatches, enriched.length, enrichedCount, totalItems);
      } catch (e) {
        errorCount += batch.length;
        batchError(batchNum, totalBatches, e instanceof Error ? e.message : "Errore sconosciuto", errorCount);
      }
    }

    enrichDone(enrichedCount, errorCount, totalCount);
  } catch (e) {
    enrichError(e instanceof Error ? e.message : "Errore fatale durante l'arricchimento");
  }
}
