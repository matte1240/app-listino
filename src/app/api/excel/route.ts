import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { verifyToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth";
import { parseExcel } from "@/lib/excel";
import { getDb } from "@/lib/db";

const EXCEL_PATH = path.join(process.cwd(), "data", "listino.xlsx");

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
  const materials = parseExcel(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO materials (codice, descrizione, categoria, raggr, um, prezzo_listino, prezzo_riservato, prezzo_pubblico, pz_confezione, nota, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(codice) DO UPDATE SET
      descrizione = excluded.descrizione,
      categoria = excluded.categoria,
      raggr = excluded.raggr,
      um = excluded.um,
      prezzo_listino = excluded.prezzo_listino,
      prezzo_riservato = excluded.prezzo_riservato,
      prezzo_pubblico = excluded.prezzo_pubblico,
      pz_confezione = excluded.pz_confezione,
      nota = excluded.nota,
      updated_at = excluded.updated_at
  `);
  const upsertAll = db.transaction((rows: typeof materials) => {
    for (const m of rows) {
      upsert.run(m.codice, m.descrizione, m.categoria, m.raggr, m.um,
        m.prezzoListino, m.prezzoRiservato, m.prezzoPublico, m.pzConfezione, m.nota);
    }
  });
  upsertAll(materials);

  return NextResponse.json({ ok: true, count: materials.length });
}
