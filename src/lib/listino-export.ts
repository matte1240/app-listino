import type { Material } from "@/types";

export const DISCOUNT_8_MULTIPLIER = 0.92;
export const DISCOUNT_15_MULTIPLIER = 0.85;

const PRICE_FORMAT = "#,##0.00";
const PRICE_COLUMNS = [3, 4, 5];
const COLUMNS = [
  "Categoria",
  "Codice articolo",
  "Descrizione articolo",
  "Prezzo listino",
  "Sconto 8%",
  "Sconto 15%",
  "Stato",
];
const COLUMN_WIDTHS = [28, 16, 60, 14, 12, 12, 12];

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
 * Genera il listino in formato Excel: una tabella unica con i filtri attivi
 * sulle intestazioni, ordinata per categoria come nella stampa PDF.
 */
export async function exportListinoToExcel(materials: Material[], fileName = buildListinoFileName()) {
  const XLSX = await import("xlsx");

  const rows: Row[] = [[...COLUMNS]];

  for (const [categoria, items] of groupByCategoria(materials)) {
    for (const item of items) {
      const prezzo = item.prezzoListino || 0;
      rows.push([
        categoria.toUpperCase(),
        item.codice,
        item.descrizioneAI || item.descrizione,
        roundPrice(prezzo),
        roundPrice(prezzo * DISCOUNT_8_MULTIPLIER),
        roundPrice(prezzo * DISCOUNT_15_MULTIPLIER),
        item.obsoleto ? "Obsoleto" : "Attivo",
      ]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length - 1, c: COLUMNS.length - 1 },
    }),
  };

  for (let r = 1; r < rows.length; r += 1) {
    for (const c of PRICE_COLUMNS) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = PRICE_FORMAT;
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Listino");
  XLSX.writeFile(workbook, fileName, { compression: true });
}
