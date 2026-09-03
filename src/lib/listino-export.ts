import type { Material } from "@/types";

export const DISCOUNT_8_MULTIPLIER = 0.92;
export const DISCOUNT_15_MULTIPLIER = 0.85;

const PRICE_FORMAT = "#,##0.00";
const COLUMNS = ["Codice articolo", "Descrizione articolo", "Prezzo listino", "Sconto 8%", "Sconto 15%"];

type Row = (string | number | null)[];

/** Arrotonda ai centesimi, come i prezzi mostrati nel listino stampato. */
function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function groupByCategoria(materials: Material[]): [string, Material[]][] {
  const map = new Map<string, Material[]>();
  for (const material of materials) {
    const categoria = material.categoria?.trim() || "SENZA CATEGORIA";
    if (!map.has(categoria)) map.set(categoria, []);
    map.get(categoria)!.push(material);
  }
  return Array.from(map.entries());
}

export function buildListinoFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `listino-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.xlsx`;
}

/**
 * Genera il listino in formato Excel con la stessa struttura della stampa PDF:
 * un blocco per categoria, con intestazione, articoli e prezzi scontati.
 */
export async function exportListinoToExcel(materials: Material[], fileName = buildListinoFileName()) {
  const XLSX = await import("xlsx");

  const rows: Row[] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const priceCells: string[] = [];

  for (const [categoria, items] of groupByCategoria(materials)) {
    if (rows.length > 0) rows.push([]);

    merges.push({
      s: { r: rows.length, c: 0 },
      e: { r: rows.length, c: COLUMNS.length - 1 },
    });
    rows.push([categoria.toUpperCase()]);
    rows.push([...COLUMNS]);

    for (const item of items) {
      const prezzo = item.prezzoListino || 0;
      const descrizione = item.descrizioneAI || item.descrizione;
      rows.push([
        item.codice,
        item.obsoleto ? `${descrizione} (OBSOLETO)` : descrizione,
        roundPrice(prezzo),
        roundPrice(prezzo * DISCOUNT_8_MULTIPLIER),
        roundPrice(prezzo * DISCOUNT_15_MULTIPLIER),
      ]);
      for (let col = 2; col < COLUMNS.length; col += 1) {
        priceCells.push(XLSX.utils.encode_cell({ r: rows.length - 1, c: col }));
      }
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!merges"] = merges;
  sheet["!cols"] = [{ wch: 16 }, { wch: 60 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];

  for (const address of priceCells) {
    const cell = sheet[address];
    if (cell) cell.z = PRICE_FORMAT;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Listino");
  XLSX.writeFile(workbook, fileName, { compression: true });
}
