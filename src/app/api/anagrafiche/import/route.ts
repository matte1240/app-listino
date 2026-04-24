import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  parseAnagraficheExcel,
  AnagraficheColumnMappingError,
  type ParsedAnagrafica,
} from "@/lib/excel";

const ANAGRAFICHE_PATH = path.join(process.cwd(), "data", "anagrafiche.xlsx");

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
  const existingRows = db.prepare("SELECT codice FROM anagrafiche").all() as { codice: string }[];
  const knownCodes = new Set(existingRows.map((row) => row.codice));

  let imported = 0;
  let updated = 0;

  const upsert = db.prepare(`
    INSERT INTO anagrafiche (codice, ragione_sociale, indirizzo, cap_citta, piva, sede_legale, search_text, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(codice) DO UPDATE SET
      ragione_sociale = excluded.ragione_sociale,
      indirizzo = excluded.indirizzo,
      cap_citta = excluded.cap_citta,
      piva = excluded.piva,
      sede_legale = excluded.sede_legale,
      search_text = excluded.search_text,
      updated_at = excluded.updated_at
  `);

  const upsertAll = db.transaction((rows: ParsedAnagrafica[]) => {
    for (const row of rows) {
      if (knownCodes.has(row.codice)) {
        updated += 1;
      } else {
        imported += 1;
        knownCodes.add(row.codice);
      }
      upsert.run(
        row.codice,
        row.ragioneSociale,
        row.indirizzo,
        row.capCitta,
        row.partitaIva,
        row.sedeLegale,
        row.searchText
      );
    }
  });

  upsertAll(anagrafiche);

  return NextResponse.json({ ok: true, total: anagrafiche.length, imported, updated });
}
