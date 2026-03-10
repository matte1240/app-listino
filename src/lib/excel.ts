import * as XLSX from "xlsx";
import type { Material } from "@/types";

// Column header names in cartongesso.xlsx
const COL_CODICE = "Codice Articolo";
const COL_DESCRIZIONE = "Descrizione Articolo";
const COL_CATEGORIA = "Data Ultima Modifica";
const COL_RAGGR = "Raggr.";
const COL_UM = "U.M.";
const COL_PREZZO_LISTINO = "Prezzo Listino";
const COL_PREZZO_RISERVATO = "Prezzo Riservato 50";
const COL_PREZZO_PUBBLICO = "Prezzo Pubblico 52";
const COL_PZ_CONFEZIONE = "PZ x confezione";
const COL_NOTA = "Note";

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
      codice: String(row[COL_CODICE] ?? "").trim(),
      descrizione: String(row[COL_DESCRIZIONE] ?? "").trim(),
      categoria: String(row[COL_CATEGORIA] ?? "").trim(),
      raggr: String(row[COL_RAGGR] ?? "").trim(),
      um: String(row[COL_UM] ?? "").trim(),
      prezzoListino: parseFloat(String(row[COL_PREZZO_LISTINO] ?? "0")) || 0,
      prezzoRiservato: parseFloat(String(row[COL_PREZZO_RISERVATO] ?? "0")) || 0,
      prezzoPublico: parseFloat(String(row[COL_PREZZO_PUBBLICO] ?? "0")) || 0,
      pzConfezione: parseFloat(String(row[COL_PZ_CONFEZIONE] ?? "0")) || 0,
      nota: String(row[COL_NOTA] ?? "").trim(),
    }))
    .filter((m) => m.codice !== "");

  return materials;
}
