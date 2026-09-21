import type { Material, OrderHistoryItem, OrderLine } from "@/types";
import {
  insertLineBefore,
  itemsToLines,
  makeCommentLine,
  makeManualLine,
  moveLine,
  removeLine,
  reorderLines,
  setTrasportoLine,
  updateLine,
  upsertArticleLine,
} from "@/lib/order-lines";

/** Azioni sulle righe condivise dagli store di ordine e preventivo. */
export interface LineActions {
  /** Aggiunge o aggiorna la riga articolo del materiale (qty <= 0 la rimuove). */
  upsertArticolo: (
    material: Pick<Material, "codice" | "descrizione" | "descrizioneAI" | "um" | "prezzoListino">,
    qty: number,
    sconto: number
  ) => void;
  /** Sostituisce tutte le righe (caricamento in modifica / prefill da preventivo). */
  setLines: (items: ReadonlyArray<OrderHistoryItem>) => void;
  updateLine: (id: string, patch: Partial<OrderHistoryItem>) => void;
  removeLine: (id: string) => void;
  moveLine: (id: string, direction: "up" | "down") => void;
  reorderLines: (activeId: string, overId: string) => void;
  /** Inserisce una riga manuale prima di `beforeId` (o in coda); restituisce l'id creato. */
  addManualLine: (beforeId?: string | null) => string;
  /** Inserisce una riga nota prima di `beforeId` (o in coda); restituisce l'id creato. */
  addCommentLine: (beforeId?: string | null) => string;
  /** Imposta (importo > 0) o rimuove (null) la riga spese di trasporto. */
  setTrasporto: (importo: number | null) => void;
}

type LinesState = { lines: OrderLine[] };
type SetState<S extends LinesState> = (updater: (state: S) => Partial<S>) => void;

export function createLineActions<S extends LinesState>(set: SetState<S>): LineActions {
  const update = (fn: (lines: OrderLine[]) => OrderLine[]) =>
    set((state) => ({ lines: fn(state.lines) }) as Partial<S>);

  return {
    upsertArticolo: (material, qty, sconto) => update((lines) => upsertArticleLine(lines, material, qty, sconto)),
    setLines: (items) => update(() => itemsToLines(items)),
    updateLine: (id, patch) => update((lines) => updateLine(lines, id, patch)),
    removeLine: (id) => update((lines) => removeLine(lines, id)),
    moveLine: (id, direction) => update((lines) => moveLine(lines, id, direction)),
    reorderLines: (activeId, overId) => update((lines) => reorderLines(lines, activeId, overId)),
    addManualLine: (beforeId) => {
      const line = makeManualLine();
      update((lines) => insertLineBefore(lines, line, beforeId));
      return line.id;
    },
    addCommentLine: (beforeId) => {
      const line = makeCommentLine();
      update((lines) => insertLineBefore(lines, line, beforeId));
      return line.id;
    },
    setTrasporto: (importo) => update((lines) => setTrasportoLine(lines, importo)),
  };
}
