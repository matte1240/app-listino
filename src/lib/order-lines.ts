import type { Material, OrderHistoryItem, OrderLine, OrderLineType } from "@/types";
import { parseLocalizedNumber } from "@/lib/utils";
import { CIG_LENGTH, CUP_LENGTH, isValidCig, isValidCup } from "@/lib/cig-cup";

/**
 * Logica pura e condivisa (client + server) sulle righe di ordini e preventivi.
 * Nessun import di `db`: questo modulo deve restare utilizzabile dai componenti client.
 */

export const PRESET_DISCOUNTS: readonly number[] = [0, 8, 15];
export const DEFAULT_CODICE_TRASPORTO = "TRASPORTO";
export const DEFAULT_CODICE_MANUALE = "MANUALE";
export const TRASPORTO_DESCRIZIONE = "Spese di trasporto";
export const ORDER_LINE_TYPES: readonly OrderLineType[] = ["articolo", "manuale", "commento", "trasporto"];
/** Unità di misura selezionabili per gli articoli manuali (la prima è il default). */
export const MANUAL_LINE_UNITS: readonly string[] = ["PZ", "ML", "MQ", "KG"];

export interface LineCodes {
  /** Codice Metodo usato per le righe inserite manualmente. */
  codiceManuale: string;
  /** Codice Metodo usato per la riga spese di trasporto. */
  codiceTrasporto: string;
}

export const DEFAULT_LINE_CODES: LineCodes = {
  codiceManuale: DEFAULT_CODICE_MANUALE,
  codiceTrasporto: DEFAULT_CODICE_TRASPORTO,
};

export function newLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback per contesti non sicuri (es. tablet su HTTP in LAN) dove randomUUID non esiste.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getLineType(item: Pick<OrderHistoryItem, "tipo">): OrderLineType {
  return item.tipo && ORDER_LINE_TYPES.includes(item.tipo) ? item.tipo : "articolo";
}

/** Riga che conta come "articolo" (contatori, totale pezzi, validazione): articolo o manuale. */
export function isArticleLine(item: Pick<OrderHistoryItem, "tipo">): boolean {
  const tipo = getLineType(item);
  return tipo === "articolo" || tipo === "manuale";
}

/** Riga che concorre al totale imponibile: articolo, manuale o trasporto. */
export function isPriceableLine(item: Pick<OrderHistoryItem, "tipo">): boolean {
  return getLineType(item) !== "commento";
}

export function isCommentLine(item: Pick<OrderHistoryItem, "tipo">): boolean {
  return getLineType(item) === "commento";
}

export function isTrasportoLine(item: Pick<OrderHistoryItem, "tipo">): boolean {
  return getLineType(item) === "trasporto";
}

export function countArticleLines(items: ReadonlyArray<Pick<OrderHistoryItem, "tipo">>): number {
  return items.filter(isArticleLine).length;
}

/**
 * Motivo per cui l'ordine non si può salvare (null = completo), con il campo da sistemare nel messaggio.
 * Una bozza richiede solo cliente e almeno un articolo; l'invio anche magazzino e CIG/CUP completi (se inseriti).
 */
export function getOrderIncompleteReason(
  order: { cliente: string; magazzino?: unknown; cig: string; cup: string; items: ReadonlyArray<Pick<OrderHistoryItem, "tipo">> },
  status: "bozza" | "confermato"
): string | null {
  if (!order.cliente.trim()) return "Indica il cliente dell'ordine.";
  if (countArticleLines(order.items) === 0) return "Aggiungi almeno un articolo all'ordine.";
  if (status === "bozza") return null;
  if (typeof order.magazzino !== "string" || !order.magazzino.trim()) return "Seleziona il magazzino dell'ordine.";
  if (!isValidCig(order.cig)) return `Il CIG deve avere ${CIG_LENGTH} caratteri.`;
  if (!isValidCup(order.cup)) return `Il CUP deve avere ${CUP_LENGTH} caratteri.`;
  return null;
}

export function sumArticleQty(items: ReadonlyArray<Pick<OrderHistoryItem, "tipo" | "qty">>): number {
  return items.reduce((sum, item) => (isArticleLine(item) ? sum + item.qty : sum), 0);
}

export function isPresetDiscount(sconto: number | undefined): boolean {
  return PRESET_DISCOUNTS.includes(sconto ?? 0);
}

/** Una riga richiede approvazione admin quando lo sconto non è uno dei preset (0/8/15). */
export function lineRequiresApproval(item: Pick<OrderHistoryItem, "tipo" | "sconto">): boolean {
  return isArticleLine(item) && !isPresetDiscount(item.sconto);
}

export function itemsRequireApproval(items: ReadonlyArray<Pick<OrderHistoryItem, "tipo" | "sconto">>): boolean {
  return items.some(lineRequiresApproval);
}

export function getApprovalLines<T extends Pick<OrderHistoryItem, "tipo" | "sconto">>(items: ReadonlyArray<T>): T[] {
  return items.filter(lineRequiresApproval);
}

/**
 * Chiave stabile per confrontare le righe di due versioni dello stesso ordine.
 * Gli articoli restano identificati dal codice (gli snapshot vecchi non hanno id),
 * il trasporto è unico, manuali e commenti usano l'id (o la posizione come ripiego).
 */
export function lineKey(item: Pick<OrderHistoryItem, "id" | "tipo" | "codice">, index: number): string {
  const tipo = getLineType(item);
  if (tipo === "articolo") return `a:${item.codice}`;
  if (tipo === "trasporto") return "t";
  return `x:${item.id ?? `idx${index}`}`;
}

function approvalLineSignature(item: OrderHistoryItem): string {
  const tipo = getLineType(item);
  const identity = tipo === "articolo" ? item.codice : item.descrizione.trim().toLowerCase();
  return `${tipo}|${identity}|${item.prezzoListino}|${item.sconto ?? 0}`;
}

/**
 * True se ogni riga dell'ordine che richiede approvazione ha una riga identica
 * (tipo, articolo/descrizione, prezzo, sconto) nel preventivo di origine.
 * Usata per non richiedere una seconda approvazione quando l'ordine nasce
 * da un preventivo già approvato senza cambiare le righe scontate.
 */
export function linesCoveredByQuotation(
  orderItems: ReadonlyArray<OrderHistoryItem>,
  quotationItems: ReadonlyArray<OrderHistoryItem>
): boolean {
  const approved = new Set(quotationItems.filter(lineRequiresApproval).map(approvalLineSignature));
  return orderItems.filter(lineRequiresApproval).every((item) => approved.has(approvalLineSignature(item)));
}

/** Mantiene al massimo una riga trasporto e la sposta in coda. */
export function ensureTrasportoLast<T extends Pick<OrderHistoryItem, "tipo">>(lines: ReadonlyArray<T>): T[] {
  const others = lines.filter((line) => !isTrasportoLine(line));
  const trasporto = lines.find(isTrasportoLine);
  return trasporto ? [...others, trasporto] : [...others];
}

function clampDiscount(value: unknown): number {
  const parsed = parseLocalizedNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  const clamped = Math.min(100, Math.max(0, parsed));
  return Math.round(clamped * 100) / 100;
}

function nonNegative(value: unknown): number {
  const parsed = parseLocalizedNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeId(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || newLineId();
}

/**
 * Normalizza e valida le righe ricevute dall'API. Righe non valide vengono scartate.
 * Assegna sempre `id` e `tipo`, timbra i codici Metodo configurati su manuali/trasporto
 * e garantisce che il trasporto sia unico e in coda.
 */
export function normalizeOrderItems(raw: unknown, codes: LineCodes = DEFAULT_LINE_CODES): OrderHistoryItem[] {
  if (!Array.isArray(raw)) return [];

  const normalized: OrderHistoryItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<OrderHistoryItem>;
    const tipo = getLineType(item);
    const id = normalizeId(item.id);
    const descrizione = String(item.descrizione ?? "").trim();
    const um = String(item.um ?? "").trim();

    if (tipo === "commento") {
      if (!descrizione) continue;
      normalized.push({ id, tipo, codice: "", descrizione, qty: 0, um: "", prezzoListino: 0, sconto: 0 });
      continue;
    }

    if (tipo === "trasporto") {
      const importo = nonNegative(item.prezzoListino);
      if (importo <= 0) continue;
      normalized.push({
        id,
        tipo,
        codice: codes.codiceTrasporto,
        descrizione: descrizione || TRASPORTO_DESCRIZIONE,
        qty: 1,
        um: um || "",
        prezzoListino: importo,
        sconto: 0,
      });
      continue;
    }

    const qty = nonNegative(item.qty);
    if (qty <= 0) continue;
    const prezzoListino = nonNegative(item.prezzoListino);
    const sconto = clampDiscount(item.sconto);

    if (tipo === "manuale") {
      if (!descrizione) continue;
      normalized.push({ id, tipo, codice: codes.codiceManuale, descrizione, qty, um, prezzoListino, sconto });
      continue;
    }

    const codice = String(item.codice ?? "").trim();
    if (!codice) continue;
    normalized.push({ id, tipo: "articolo", codice, descrizione, qty, um, prezzoListino, sconto });
  }

  return ensureTrasportoLast(normalized);
}

/** Converte le righe salvate in righe di store (id e tipo garantiti, ordine preservato). */
export function itemsToLines(items: ReadonlyArray<OrderHistoryItem>): OrderLine[] {
  return ensureTrasportoLast(
    items.map((item) => ({
      ...item,
      id: item.id?.trim() || newLineId(),
      tipo: getLineType(item),
      sconto: item.sconto ?? 0,
    }))
  );
}

export function findArticleLine(lines: ReadonlyArray<OrderLine>, codice: string): OrderLine | undefined {
  return lines.find((line) => line.tipo === "articolo" && line.codice === codice);
}

export function getTrasportoLine(lines: ReadonlyArray<OrderLine>): OrderLine | undefined {
  return lines.find(isTrasportoLine);
}

function insertBeforeTrasporto(lines: ReadonlyArray<OrderLine>, line: OrderLine): OrderLine[] {
  return ensureTrasportoLast([...lines, line]);
}

/**
 * Aggiunge o aggiorna la riga articolo per il materiale dato (una riga per codice).
 * qty <= 0 rimuove la riga. La descrizione/U.M./prezzo vengono fotografati dal listino.
 */
export function upsertArticleLine(
  lines: ReadonlyArray<OrderLine>,
  material: Pick<Material, "codice" | "descrizione" | "descrizioneAI" | "um" | "prezzoListino">,
  qty: number,
  sconto: number
): OrderLine[] {
  const safeQty = Math.max(0, qty);
  const existing = findArticleLine(lines, material.codice);

  if (safeQty <= 0) {
    return existing ? lines.filter((line) => line.id !== existing.id) : [...lines];
  }

  const snapshot = {
    codice: material.codice,
    descrizione: material.descrizioneAI || material.descrizione,
    um: material.um,
    prezzoListino: material.prezzoListino,
  };

  if (existing) {
    return lines.map((line) => (line.id === existing.id ? { ...line, ...snapshot, qty: safeQty, sconto } : line));
  }

  return insertBeforeTrasporto(lines, { id: newLineId(), tipo: "articolo", ...snapshot, qty: safeQty, sconto });
}

export function removeLine(lines: ReadonlyArray<OrderLine>, id: string): OrderLine[] {
  return lines.filter((line) => line.id !== id);
}

export function updateLine(lines: ReadonlyArray<OrderLine>, id: string, patch: Partial<OrderHistoryItem>): OrderLine[] {
  return lines.map((line) => (line.id === id ? { ...line, ...patch, id: line.id, tipo: line.tipo } : line));
}

export function moveLine(lines: ReadonlyArray<OrderLine>, id: string, direction: "up" | "down"): OrderLine[] {
  const movable = lines.filter((line) => !isTrasportoLine(line));
  const index = movable.findIndex((line) => line.id === id);
  if (index === -1) return [...lines];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= movable.length) return [...lines];
  const next = [...movable];
  [next[index], next[target]] = [next[target], next[index]];
  return ensureTrasportoLast([...next, ...lines.filter(isTrasportoLine)]);
}

/** Sposta la riga `activeId` nella posizione occupata da `overId` (semantica drag & drop). */
export function reorderLines(lines: ReadonlyArray<OrderLine>, activeId: string, overId: string): OrderLine[] {
  if (activeId === overId) return [...lines];
  const movable = lines.filter((line) => !isTrasportoLine(line));
  const from = movable.findIndex((line) => line.id === activeId);
  const to = movable.findIndex((line) => line.id === overId);
  if (from === -1 || to === -1) return [...lines];
  const next = [...movable];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return ensureTrasportoLast([...next, ...lines.filter(isTrasportoLine)]);
}

/** Dati iniziali di una riga manuale (dalla casella di inserimento rapido). */
export type ManualLineInit = Partial<Pick<OrderHistoryItem, "descrizione" | "um" | "qty" | "prezzoListino" | "sconto">>;

export function makeManualLine(codiceManuale: string = DEFAULT_CODICE_MANUALE, init: ManualLineInit = {}): OrderLine {
  return {
    id: newLineId(),
    tipo: "manuale",
    codice: codiceManuale,
    descrizione: init.descrizione ?? "",
    qty: init.qty ?? 1,
    um: init.um ?? "",
    prezzoListino: init.prezzoListino ?? 0,
    sconto: init.sconto ?? 0,
  };
}

export function makeCommentLine(testo = ""): OrderLine {
  return { id: newLineId(), tipo: "commento", codice: "", descrizione: testo, qty: 0, um: "", prezzoListino: 0, sconto: 0 };
}

/** Inserisce `line` subito prima di `beforeId` (o in coda, prima del trasporto, se assente). */
export function insertLineBefore(lines: ReadonlyArray<OrderLine>, line: OrderLine, beforeId?: string | null): OrderLine[] {
  if (!beforeId) return insertBeforeTrasporto(lines, line);
  const index = lines.findIndex((existing) => existing.id === beforeId);
  if (index === -1) return insertBeforeTrasporto(lines, line);
  const next = [...lines];
  next.splice(index, 0, line);
  return ensureTrasportoLast(next);
}

/** Completa descrizione/U.M./prezzo delle righe articolo prive di snapshot (es. carrello migrato) dal catalogo. */
export function hydrateLinesFromMaterials(
  lines: ReadonlyArray<OrderLine>,
  materials: ReadonlyArray<Pick<Material, "codice" | "descrizione" | "descrizioneAI" | "um" | "prezzoListino">>
): OrderLine[] {
  const needsHydration = lines.some((line) => line.tipo === "articolo" && !line.descrizione && line.prezzoListino === 0);
  if (!needsHydration) return [...lines];
  const byCodice = new Map(materials.map((material) => [material.codice, material]));
  return lines.map((line) => {
    if (line.tipo !== "articolo" || line.descrizione || line.prezzoListino !== 0) return line;
    const material = byCodice.get(line.codice);
    if (!material) return line;
    return {
      ...line,
      descrizione: material.descrizioneAI || material.descrizione,
      um: material.um,
      prezzoListino: material.prezzoListino,
    };
  });
}

/** Migrazione del vecchio carrello persistito `{ codice: { flagged, qty, sconto } }` in righe ordinate per codice. */
export function migrateLegacyCartMap(map: unknown): OrderLine[] {
  if (!map || typeof map !== "object") return [];
  const entries = Object.entries(map as Record<string, { flagged?: boolean; qty?: number; sconto?: number }>)
    .filter(([, value]) => value && value.flagged && (value.qty ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([codice, value]) => ({
    id: newLineId(),
    tipo: "articolo" as const,
    codice,
    descrizione: "",
    qty: value.qty ?? 0,
    um: "",
    prezzoListino: 0,
    sconto: value.sconto ?? 0,
  }));
}

/** Imposta (importo > 0) o rimuove (null/0) la riga spese di trasporto. */
export function setTrasportoLine(
  lines: ReadonlyArray<OrderLine>,
  importo: number | null,
  codiceTrasporto: string = DEFAULT_CODICE_TRASPORTO
): OrderLine[] {
  const others = lines.filter((line) => !isTrasportoLine(line));
  if (importo === null || !Number.isFinite(importo) || importo <= 0) return others;
  const existing = getTrasportoLine(lines);
  const trasporto: OrderLine = existing
    ? { ...existing, prezzoListino: importo }
    : {
        id: newLineId(),
        tipo: "trasporto",
        codice: codiceTrasporto,
        descrizione: TRASPORTO_DESCRIZIONE,
        qty: 1,
        um: "",
        prezzoListino: importo,
        sconto: 0,
      };
  return [...others, trasporto];
}
