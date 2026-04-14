import * as XLSX from "xlsx";
import type { Material } from "@/types";

type MaterialField =
  | "codice"
  | "descrizione"
  | "categoria"
  | "raggr"
  | "um"
  | "prezzoListino"
  | "prezzoRiservato"
  | "prezzoPublico"
  | "pzConfezione"
  | "nota"
  | "obsoleto";

interface ColumnMappingErrorDetails {
  missingColumns: string[];
  foundHeaders: string[];
}

export class ExcelColumnMappingError extends Error {
  details: ColumnMappingErrorDetails;

  constructor(details: ColumnMappingErrorDetails) {
    super("Colonne obbligatorie mancanti nel file Excel.");
    this.name = "ExcelColumnMappingError";
    this.details = details;
  }
}

const FIELD_LABELS: Record<MaterialField, string> = {
  codice: "Codice",
  descrizione: "Descrizione",
  categoria: "Categoria",
  raggr: "Raggruppamento",
  um: "Unita di misura",
  prezzoListino: "Prezzo Listino",
  prezzoRiservato: "Prezzo Riservato",
  prezzoPublico: "Prezzo Pubblico",
  pzConfezione: "Pezzi confezione",
  nota: "Note",
  obsoleto: "Obsoleto",
};

const COLUMN_ALIASES: Record<MaterialField, string[]> = {
  codice: ["Codice Articolo", "Codice", "Cod.", "Codice prodotto", "SKU", "Articolo"],
  descrizione: ["Descrizione Articolo", "Descrizione", "Descrizione prodotto", "Prodotto"],
  categoria: ["Categoria", "Famiglia", "Data Ultima Modifica", "Gruppo categoria"],
  raggr: ["Raggr.", "Raggr", "Raggruppamento", "Gruppo"],
  um: ["U.M.", "U.M", "UM", "Unita di misura", "Unita misura", "Unita"],
  prezzoListino: ["Prezzo Listino", "Listino", "Prezzo", "Prezzo base"],
  prezzoRiservato: ["Prezzo Riservato 50", "Prezzo Riservato", "Riservato"],
  prezzoPublico: ["Prezzo Pubblico 52", "Prezzo Pubblico", "Pubblico"],
  pzConfezione: ["PZ x confezione", "PZ confezione", "Pezzi confezione", "Pz x conf"],
  nota: ["Note", "Nota"],
  obsoleto: ["OBSOLETO", "Obsoleto", "Stato", "Status", "Disponibilita"],
};

const REQUIRED_FIELDS: MaterialField[] = ["codice", "descrizione", "prezzoListino"];

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? "").trim();
  if (!text) return 0;

  const compact = text.replace(/\s+/g, "");
  const cleaned = compact.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return 0;

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseObsolete(value: unknown): boolean {
  const normalized = normalizeHeader(String(value ?? ""));
  if (!normalized) return false;

  return ["obsoleto", "obsolete", "si", "yes", "true", "1", "x", "discontinued"].includes(normalized);
}

function resolveColumnIndexes(headers: string[]): Partial<Record<MaterialField, number>> {
  const indexByNormalized = new Map<string, number>();

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized && !indexByNormalized.has(normalized)) {
      indexByNormalized.set(normalized, index);
    }
  });

  const indexes: Partial<Record<MaterialField, number>> = {};
  for (const field of Object.keys(COLUMN_ALIASES) as MaterialField[]) {
    for (const alias of COLUMN_ALIASES[field]) {
      const idx = indexByNormalized.get(normalizeHeader(alias));
      if (idx !== undefined) {
        indexes[field] = idx;
        break;
      }
    }
  }

  return indexes;
}

function readRawCell(row: unknown[], index?: number): unknown {
  return index === undefined ? "" : row[index];
}

function readTextCell(row: unknown[], index?: number): string {
  return String(readRawCell(row, index) ?? "").trim();
}

export function parseExcel(buffer: ArrayBuffer): Material[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  if (matrix.length === 0) return [];

  const headers = (matrix[0] ?? []).map((cell) => String(cell ?? "").trim());
  const indexes = resolveColumnIndexes(headers);

  const missingColumns = REQUIRED_FIELDS
    .filter((field) => indexes[field] === undefined)
    .map((field) => FIELD_LABELS[field]);

  if (missingColumns.length > 0) {
    throw new ExcelColumnMappingError({
      missingColumns,
      foundHeaders: headers.filter(Boolean),
    });
  }

  const materials: Material[] = [];
  for (const rawRow of matrix.slice(1)) {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const codice = readTextCell(row, indexes.codice);
    if (!codice) continue;

    materials.push({
      codice,
      descrizione: readTextCell(row, indexes.descrizione),
      categoria: readTextCell(row, indexes.categoria),
      raggr: readTextCell(row, indexes.raggr),
      um: readTextCell(row, indexes.um),
      prezzoListino: parseNumber(readRawCell(row, indexes.prezzoListino)),
      prezzoRiservato: parseNumber(readRawCell(row, indexes.prezzoRiservato)),
      prezzoPublico: parseNumber(readRawCell(row, indexes.prezzoPublico)),
      pzConfezione: parseNumber(readRawCell(row, indexes.pzConfezione)),
      nota: readTextCell(row, indexes.nota),
      obsoleto: parseObsolete(readRawCell(row, indexes.obsoleto)),
    });
  }

  return materials;
}
