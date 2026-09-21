import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { verifyToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth";
import { parseExcel, ExcelColumnMappingError } from "@/lib/excel";
import { getDb } from "@/lib/db";
import type { Material } from "@/types";

const EXCEL_PATH = path.join(process.cwd(), "data", "listino.xlsx");

interface ExistingMaterialRow {
  codice: string;
  descrizione: string;
  categoria: string;
  raggr: string;
  um: string;
  prezzo_listino: number;
  prezzo_riservato: number;
  prezzo_pubblico: number;
  pz_confezione: number;
  mq_confezione: number | null;
  pz_bancale: number | null;
  mq_bancale: number | null;
  nota: string;
  obsoleto: number;
}

function toMaterialSnapshot(row: ExistingMaterialRow): Material {
  return {
    codice: row.codice,
    descrizione: row.descrizione,
    categoria: row.categoria,
    raggr: row.raggr,
    um: row.um,
    prezzoListino: row.prezzo_listino,
    prezzoRiservato: row.prezzo_riservato,
    prezzoPublico: row.prezzo_pubblico,
    pzConfezione: row.pz_confezione,
    mqConfezione: row.mq_confezione,
    pzBancale: row.pz_bancale,
    mqBancale: row.mq_bancale,
    nota: row.nota,
    obsoleto: row.obsoleto === 1,
  };
}

function sameOptionalNumber(a?: number | null, b?: number | null) {
  return (a ?? null) === (b ?? null);
}

function mergeMaterialWithExisting(
  incoming: Material,
  existing: Material | undefined,
  presentFields: Set<string>
): Material {
  if (!existing) return incoming;

  return {
    codice: incoming.codice,
    descrizione: presentFields.has("descrizione") ? incoming.descrizione : existing.descrizione,
    categoria: presentFields.has("categoria") ? incoming.categoria : existing.categoria,
    raggr: presentFields.has("raggr") ? incoming.raggr : existing.raggr,
    um: presentFields.has("um") ? incoming.um : existing.um,
    prezzoListino: presentFields.has("prezzoListino") ? incoming.prezzoListino : existing.prezzoListino,
    prezzoRiservato: presentFields.has("prezzoRiservato") ? incoming.prezzoRiservato : existing.prezzoRiservato,
    prezzoPublico: presentFields.has("prezzoPublico") ? incoming.prezzoPublico : existing.prezzoPublico,
    pzConfezione: presentFields.has("pzConfezione") ? incoming.pzConfezione : existing.pzConfezione,
    mqConfezione: presentFields.has("mqConfezione") ? incoming.mqConfezione : existing.mqConfezione,
    pzBancale: presentFields.has("pzBancale") ? incoming.pzBancale : existing.pzBancale,
    mqBancale: presentFields.has("mqBancale") ? incoming.mqBancale : existing.mqBancale,
    nota: presentFields.has("nota") ? incoming.nota : existing.nota,
    obsoleto: presentFields.has("obsoleto") ? incoming.obsoleto : existing.obsoleto,
    ...(existing.descrizioneAI ? { descrizioneAI: existing.descrizioneAI } : {}),
  };
}

function isSameMaterial(a: Material, b: Material) {
  return (
    a.codice === b.codice &&
    a.descrizione === b.descrizione &&
    a.categoria === b.categoria &&
    a.raggr === b.raggr &&
    a.um === b.um &&
    a.prezzoListino === b.prezzoListino &&
    a.prezzoRiservato === b.prezzoRiservato &&
    a.prezzoPublico === b.prezzoPublico &&
    a.pzConfezione === b.pzConfezione &&
    sameOptionalNumber(a.mqConfezione, b.mqConfezione) &&
    sameOptionalNumber(a.pzBancale, b.pzBancale) &&
    sameOptionalNumber(a.mqBancale, b.mqBancale) &&
    a.nota === b.nota &&
    Boolean(a.obsoleto) === Boolean(b.obsoleto)
  );
}

export async function GET() {
  if (!fs.existsSync(EXCEL_PATH)) {
    return new NextResponse(null, { status: 404 });
  }
  const buffer = fs.readFileSync(EXCEL_PATH);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=listino.xlsx",
    },
  });
}

export async function POST(req: NextRequest) {
  // Only admins can upload
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const buffer = Buffer.from(await (file as Blob).arrayBuffer());
  const dir = path.dirname(EXCEL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EXCEL_PATH, buffer);

  // Parse and upsert materials into DB
  let parsedExcel: ReturnType<typeof parseExcel>;
  try {
    parsedExcel = parseExcel(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  } catch (error) {
    if (error instanceof ExcelColumnMappingError) {
      return NextResponse.json(
        {
          error: "Colonne obbligatorie mancanti nel file Excel.",
          missingColumns: error.details.missingColumns,
          foundHeaders: error.details.foundHeaders,
        },
        { status: 400 }
      );
    }

    console.error("[excel] Errore parsing file:", error);
    return NextResponse.json({ error: "Formato file non valido" }, { status: 400 });
  }

  const db = getDb();
  const existingRows = db.prepare(`
      SELECT codice, descrizione, categoria, raggr, um, prezzo_listino, prezzo_riservato,
        prezzo_pubblico, pz_confezione, mq_confezione, pz_bancale, mq_bancale, nota, obsoleto
    FROM materials
  `).all() as ExistingMaterialRow[];

  const existingByCode = new Map(existingRows.map((row) => [row.codice, toMaterialSnapshot(row)]));
  const { materials, presentFields } = parsedExcel;

  if (!presentFields.has("prezzoListino")) {
    const unknownCodes = materials
      .filter((material) => !existingByCode.has(material.codice))
      .map((material) => material.codice);

    if (unknownCodes.length > 0) {
      return NextResponse.json(
        {
          error: "Il file non contiene Prezzo Listino: posso aggiornare solo articoli gia' presenti.",
          missingPricesForCodes: unknownCodes.slice(0, 20),
        },
        { status: 400 }
      );
    }
  }

  const insert = db.prepare(`
    INSERT INTO materials (codice, descrizione, categoria, raggr, um, prezzo_listino, prezzo_riservato, prezzo_pubblico, pz_confezione, mq_confezione, pz_bancale, mq_bancale, nota, obsoleto, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const update = db.prepare(`
    UPDATE materials
    SET descrizione = ?,
        categoria = ?,
        raggr = ?,
        um = ?,
        prezzo_listino = ?,
        prezzo_riservato = ?,
        prezzo_pubblico = ?,
        pz_confezione = ?,
        mq_confezione = ?,
        pz_bancale = ?,
        mq_bancale = ?,
        nota = ?,
        obsoleto = ?,
        updated_at = datetime('now')
    WHERE codice = ?
  `);

  let imported = 0;
  let updated = 0;
  let unchanged = 0;

  const upsertAll = db.transaction((rows: typeof materials) => {
    for (const rawMaterial of rows) {
      const existing = existingByCode.get(rawMaterial.codice);
      const m = mergeMaterialWithExisting(rawMaterial, existing, presentFields);

      if (!existing) {
        insert.run(m.codice, m.descrizione, m.categoria, m.raggr, m.um,
          m.prezzoListino, m.prezzoRiservato, m.prezzoPublico, m.pzConfezione,
          m.mqConfezione, m.pzBancale, m.mqBancale, m.nota, m.obsoleto ? 1 : 0);
        existingByCode.set(m.codice, m);
        imported += 1;
        continue;
      }

      if (isSameMaterial(existing, m)) {
        unchanged += 1;
        continue;
      }

      update.run(m.descrizione, m.categoria, m.raggr, m.um,
        m.prezzoListino, m.prezzoRiservato, m.prezzoPublico, m.pzConfezione,
        m.mqConfezione, m.pzBancale, m.mqBancale, m.nota, m.obsoleto ? 1 : 0, m.codice);
      existingByCode.set(m.codice, m);
      updated += 1;
    }
  });
  upsertAll(materials);

  return NextResponse.json({ ok: true, count: materials.length, imported, updated, unchanged });
}
