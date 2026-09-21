import type { Material } from "@/types";

export const DISCOUNT_8_MULTIPLIER = 0.92;
export const DISCOUNT_15_MULTIPLIER = 0.85;

const PRICE_FORMAT = "#,##0.00";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COLUMNS = [
  { header: "Categoria", key: "categoria", width: 28 },
  { header: "Codice articolo", key: "codice", width: 16 },
  { header: "Descrizione articolo", key: "descrizione", width: 60 },
  { header: "Prezzo listino", key: "prezzoListino", width: 14, numFmt: PRICE_FORMAT },
  { header: "Sconto 8%", key: "sconto8", width: 12, numFmt: PRICE_FORMAT },
  { header: "Sconto 15%", key: "sconto15", width: 12, numFmt: PRICE_FORMAT },
  { header: "Stato", key: "stato", width: 12 },
];

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

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Genera il listino in formato Excel: una tabella unica con intestazione
 * bloccata e filtri su tutte le colonne, ordinata per categoria come nella
 * stampa PDF.
 */
export async function buildListinoWorkbookBuffer(materials: Material[]): Promise<ArrayBuffer> {
  const ExcelJS = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Listino");
  sheet.columns = COLUMNS.map(({ header, key, width }) => ({ header, key, width }));

  for (const [categoria, items] of groupByCategoria(materials)) {
    for (const item of items) {
      const prezzo = item.prezzoListino || 0;
      sheet.addRow({
        categoria: categoria.toUpperCase(),
        codice: item.codice,
        descrizione: item.descrizioneAI || item.descrizione,
        prezzoListino: roundPrice(prezzo),
        sconto8: roundPrice(prezzo * DISCOUNT_8_MULTIPLIER),
        sconto15: roundPrice(prezzo * DISCOUNT_15_MULTIPLIER),
        stato: item.obsoleto ? "Obsoleto" : "Attivo",
      });
    }
  }

  COLUMNS.forEach((column, index) => {
    if (column.numFmt) sheet.getColumn(index + 1).numFmt = column.numFmt;
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEBFA" } };

  // Intestazione sempre visibile durante lo scorrimento + filtri su tutte le colonne.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sheet.rowCount, column: COLUMNS.length },
  };

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function exportListinoToExcel(materials: Material[], fileName = buildListinoFileName()) {
  downloadBuffer(await buildListinoWorkbookBuffer(materials), fileName);
}
