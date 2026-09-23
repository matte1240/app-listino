/**
 * Codici per la fatturazione verso la Pubblica Amministrazione, in testata ordine e nell'XML Metodo
 * (client-safe: usato dal wizard e dalle route API).
 * - CIG (Codice Identificativo Gara): 10 caratteri alfanumerici
 * - CUP (Codice Unico di Progetto): 15 caratteri alfanumerici
 */
export const CIG_LENGTH = 10;
export const CUP_LENGTH = 15;

/** Maiuscolo, senza spazi né separatori, troncato alla lunghezza del codice. */
function normalizeCode(value: unknown, length: number): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, length);
}

export function normalizeCig(value: unknown): string {
  return normalizeCode(value, CIG_LENGTH);
}

export function normalizeCup(value: unknown): string {
  return normalizeCode(value, CUP_LENGTH);
}

/** Codice facoltativo: vuoto oppure completo. */
export function isValidCig(value: string): boolean {
  return value === "" || value.length === CIG_LENGTH;
}

export function isValidCup(value: string): boolean {
  return value === "" || value.length === CUP_LENGTH;
}
