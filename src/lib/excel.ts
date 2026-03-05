import * as XLSX from "xlsx";
import type { Material } from "@/types";

// Expected column header names in the Excel file
const COL_CATEGORIA = "Categoria";
const COL_CODICE = "Codice";
const COL_DESCRIZIONE = "Descrizione";
const COL_QUANTITA = "Quantita";
const COL_PZ_BANCALE = "PzBancale";

export function parseExcel(buffer: ArrayBuffer): Material[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of objects using first row as headers
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
  });

  const materials: Material[] = rows
    .map((row) => ({
      categoria: String(row[COL_CATEGORIA] ?? "").trim(),
      codice: String(row[COL_CODICE] ?? "").trim(),
      descrizione: String(row[COL_DESCRIZIONE] ?? "").trim(),
      quantita: parseFloat(String(row[COL_QUANTITA] ?? "0")) || 0,
      pzBancale: parseFloat(String(row[COL_PZ_BANCALE] ?? "0")) || 0,
    }))
    .filter((m) => m.codice !== "");

  return materials;
}
