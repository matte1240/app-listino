import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enrichMaterials } from "@/lib/ai-enrich";
import type { EnrichedData } from "@/types";

/** GET /api/ai/enrich — retrieve all enriched data from DB */
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

  return NextResponse.json({ enriched, count: rows.length, total });
}

/** POST /api/ai/enrich — trigger AI enrichment with SSE progress (admin only) */
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

  // Prepare upsert statement
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

  const batchSize = 50;
  const totalItems = materialsToEnrich.length;
  const totalBatches = Math.ceil(totalItems / batchSize);

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("start", { totalItems, totalBatches, batchSize });

      let enrichedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < totalItems; i += batchSize) {
        const batchNum = Math.floor(i / batchSize) + 1;
        const batch = materialsToEnrich.slice(i, i + batchSize);

        send("batch_start", {
          batch: batchNum,
          totalBatches,
          itemsInBatch: batch.length,
          firstCodice: batch[0]?.codice,
        });

        try {
          const enriched = await enrichMaterials(batch);
          insertMany(enriched);
          enrichedCount += enriched.length;

          send("batch_done", {
            batch: batchNum,
            totalBatches,
            enrichedInBatch: enriched.length,
            enrichedTotal: enrichedCount,
            totalItems,
            progress: Math.round((enrichedCount / totalItems) * 100),
          });
        } catch (e) {
          errorCount += batch.length;
          send("batch_error", {
            batch: batchNum,
            totalBatches,
            error: e instanceof Error ? e.message : "Errore sconosciuto",
            errorCount,
          });
        }
      }

      send("done", {
        enrichedCount,
        errorCount,
        totalCount,
        message: errorCount > 0
          ? `Arricchiti ${enrichedCount} articoli (${errorCount} errori)`
          : `Arricchiti ${enrichedCount} articoli con successo`,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
