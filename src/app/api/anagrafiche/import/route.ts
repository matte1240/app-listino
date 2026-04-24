import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import {
  parseAnagraficheExcel,
  AnagraficheColumnMappingError,
  type ParsedAnagrafica,
} from "@/lib/excel";
import { getDb } from "@/lib/db";

const ANAGRAFICHE_PATH = path.join(process.cwd(), "data", "anagrafiche.xlsx");

interface ExistingAnagrafica {
  id: number;
  codice: string;
  piva_norm: string;
}

function normalizeIdentifier(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function buildKey(codice: string, pivaNorm: string): string {
  return `${normalizeIdentifier(codice)}|${pivaNorm}`;
}

export async function POST(req: NextRequest) {
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
  const dir = path.dirname(ANAGRAFICHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ANAGRAFICHE_PATH, buffer);

  let anagrafiche: ParsedAnagrafica[];
  try {
    anagrafiche = parseAnagraficheExcel(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  } catch (error) {
    if (error instanceof AnagraficheColumnMappingError) {
      return NextResponse.json(
        {
          error: "Colonne obbligatorie mancanti nel file anagrafiche.",
          missingColumns: error.details.missingColumns,
          foundHeaders: error.details.foundHeaders,
        },
        { status: 400 }
      );
    }

    console.error("[anagrafiche] Errore parsing file:", error);
    return NextResponse.json({ error: "Formato file anagrafiche non valido" }, { status: 400 });
  }

  const db = getDb();

  const existingRows = db
    .prepare("SELECT id, codice, piva_norm FROM anagrafiche")
    .all() as ExistingAnagrafica[];

  const existingByKey = new Map<string, number>();
  for (const row of existingRows) {
    existingByKey.set(buildKey(row.codice, row.piva_norm ?? ""), row.id);
  }

  const insertStmt = db.prepare(`
    INSERT INTO anagrafiche (codice, ragione_sociale, indirizzo, cap_citta, piva, piva_norm, search_text, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const updateStmt = db.prepare(`
    UPDATE anagrafiche
    SET codice = ?,
        ragione_sociale = ?,
        indirizzo = ?,
        cap_citta = ?,
        piva = ?,
        piva_norm = ?,
        search_text = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  let imported = 0;
  let updated = 0;

  const syncAll = db.transaction((rows: ParsedAnagrafica[]) => {
    for (const row of rows) {
      const key = buildKey(row.codice, row.pivaNorm);
      const existingId = existingByKey.get(key);

      if (existingId !== undefined) {
        updateStmt.run(
          row.codice,
          row.ragioneSociale,
          row.indirizzo,
          row.capCitta,
          row.partitaIva,
          row.pivaNorm,
          row.searchText,
          existingId
        );
        updated += 1;
        continue;
      }

      insertStmt.run(
        row.codice,
        row.ragioneSociale,
        row.indirizzo,
        row.capCitta,
        row.partitaIva,
        row.pivaNorm,
        row.searchText
      );
      imported += 1;
    }
  });

  syncAll(anagrafiche);

  return NextResponse.json({
    ok: true,
    total: anagrafiche.length,
    imported,
    updated,
  });
}
