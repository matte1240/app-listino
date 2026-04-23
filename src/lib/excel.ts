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
  obsoleto: ["OBSOLETO", "Obsoleto", "Stato", "Status", "Disponibilita", "Cartongesso"],
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

  if (normalized.includes("obsoleto") || normalized.includes("obsolete") || normalized.includes("discontinued")) {
    return true;
  }

  return ["si", "yes", "true", "1", "x"].includes(normalized);
}

function resolveColumnIndexes(headers: string[]): Partial<Record<MaterialField, number>> {
  const indexByNormalized = new Map<string, number>();
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));

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

  // Fallback for custom headings like "Stato articolo obsoleto"
  if (indexes.obsoleto === undefined) {
    const fallbackIdx = normalizedHeaders.findIndex(
      (header) => header.includes("obsoleto") || header.includes("obsolete")
    );
    if (fallbackIdx !== -1) {
      indexes.obsoleto = fallbackIdx;
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

type AnagraficaField = "codice" | "ragioneSociale" | "indirizzo" | "capCitta" | "partitaIva";

interface AnagraficheColumnMappingErrorDetails {
  missingColumns: string[];
  foundHeaders: string[];
}

export class AnagraficheColumnMappingError extends Error {
  details: AnagraficheColumnMappingErrorDetails;

  constructor(details: AnagraficheColumnMappingErrorDetails) {
    super("Colonne obbligatorie mancanti nel file anagrafiche.");
    this.name = "AnagraficheColumnMappingError";
    this.details = details;
  }
}

const ANAGRAFICA_FIELD_LABELS: Record<AnagraficaField, string> = {
  codice: "Codice cliente",
  ragioneSociale: "Ragione Sociale",
  indirizzo: "Indirizzo",
  capCitta: "CAP / Citta",
  partitaIva: "P.IVA",
};

const ANAGRAFICA_COLUMN_ALIASES: Record<AnagraficaField, string[]> = {
  codice: ["N.Cli.", "N Cli", "Codice Cliente", "Codice", "Cod.Cliente", "ID Cliente"],
  ragioneSociale: ["Ragione Sociale", "RagioneSociale", "Cliente", "Azienda", "Nome"],
  indirizzo: ["Indirizzo", "Via", "Sede Legale", "Sede", "Indirizzo sede"],
  capCitta: ["CAP / Citta'", "CAP/Citta", "CAP Citta", "CAP Citta'", "Comune", "CAP"],
  partitaIva: ["P.IVA", "P IVA", "Partita IVA", "PartitaIVA", "Piva", "Codice Fiscale"],
};

const REQUIRED_ANAGRAFICA_FIELDS: AnagraficaField[] = ["codice", "ragioneSociale"];

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resolveAnagraficheColumnIndexes(headers: string[]): Partial<Record<AnagraficaField, number>> {
  const indexByNormalized = new Map<string, number>();

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized && !indexByNormalized.has(normalized)) {
      indexByNormalized.set(normalized, index);
    }
  });

  const indexes: Partial<Record<AnagraficaField, number>> = {};
  for (const field of Object.keys(ANAGRAFICA_COLUMN_ALIASES) as AnagraficaField[]) {
    for (const alias of ANAGRAFICA_COLUMN_ALIASES[field]) {
      const idx = indexByNormalized.get(normalizeHeader(alias));
      if (idx !== undefined) {
        indexes[field] = idx;
        break;
      }
    }
  }

  return indexes;
}

function buildSedeLegale(indirizzo: string, capCitta: string): string {
  if (!indirizzo && !capCitta) return "";
  if (!indirizzo) return capCitta;
  if (!capCitta) return indirizzo;
  return `${indirizzo}, ${capCitta}`;
}

export interface ParsedAnagrafica {
  codice: string;
  ragioneSociale: string;
  indirizzo: string;
  capCitta: string;
  partitaIva: string;
  sedeLegale: string;
  searchText: string;
}

export function parseAnagraficheExcel(buffer: ArrayBuffer): ParsedAnagrafica[] {
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

  const headers = (matrix[0] ?? []).map((cell: unknown) => String(cell ?? "").trim());
  const indexes = resolveAnagraficheColumnIndexes(headers);

  const missingColumns = REQUIRED_ANAGRAFICA_FIELDS
    .filter((field) => indexes[field] === undefined)
    .map((field) => ANAGRAFICA_FIELD_LABELS[field]);

  if (missingColumns.length > 0) {
    throw new AnagraficheColumnMappingError({
      missingColumns,
      foundHeaders: headers.filter(Boolean),
    });
  }

  const deduped = new Map<string, ParsedAnagrafica>();

  for (const rawRow of matrix.slice(1)) {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const codice = readTextCell(row, indexes.codice);
    if (!codice) continue;

    const ragioneSociale = readTextCell(row, indexes.ragioneSociale);
    if (!ragioneSociale) continue;

    const indirizzo = readTextCell(row, indexes.indirizzo);
    const capCitta = readTextCell(row, indexes.capCitta);
    const partitaIva = readTextCell(row, indexes.partitaIva);
    const sedeLegale = buildSedeLegale(indirizzo, capCitta);
    const searchText = normalizeForSearch(`${codice} ${ragioneSociale} ${indirizzo} ${capCitta} ${partitaIva}`);

    deduped.set(codice, {
      codice,
      ragioneSociale,
      indirizzo,
      capCitta,
      partitaIva,
      sedeLegale,
      searchText,
    });
  }

  return Array.from(deduped.values());
}
