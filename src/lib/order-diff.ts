import type { OrderHistoryItem } from "@/types";
import { getLineType, lineKey } from "@/lib/order-lines";
import { formatScontoLabel } from "@/lib/order-totals";

/**
 * Confronto fra due versioni di un ordine (client-safe: usato dalle email e dalla pagina approvazioni).
 */

export interface OrderSnapshot {
  cliente: string;
  magazzino: string;
  luogoConsegna: string;
  cig: string;
  cup: string;
  dataConsegna: string;
  note: string;
  items: OrderHistoryItem[];
}

export type PreviousOrderSnapshot = OrderSnapshot;

export interface ItemFieldChange {
  field: "qty" | "um" | "sconto" | "prezzoListino" | "descrizione";
  before: string;
  after: string;
}

export interface ModifiedItem {
  before: OrderHistoryItem;
  after: OrderHistoryItem;
  changes: ItemFieldChange[];
}

export interface OrderDiff {
  headerChanges: Array<{ label: string; before: string; after: string }>;
  added: OrderHistoryItem[];
  removed: OrderHistoryItem[];
  modified: ModifiedItem[];
  unchanged: OrderHistoryItem[];
  /** True se le righe comuni alle due versioni compaiono in un ordine diverso. */
  reordered: boolean;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function diffItem(before: OrderHistoryItem, after: OrderHistoryItem): ItemFieldChange[] {
  const changes: ItemFieldChange[] = [];
  const isComment = getLineType(after) === "commento";

  if ((before.descrizione ?? "") !== (after.descrizione ?? "")) {
    changes.push({ field: "descrizione", before: before.descrizione ?? "", after: after.descrizione ?? "" });
  }
  if (isComment) return changes;

  if (before.qty !== after.qty) {
    changes.push({ field: "qty", before: String(before.qty), after: String(after.qty) });
  }
  if ((before.um ?? "") !== (after.um ?? "")) {
    changes.push({ field: "um", before: before.um ?? "", after: after.um ?? "" });
  }
  if ((before.sconto ?? 0) !== (after.sconto ?? 0)) {
    changes.push({ field: "sconto", before: formatScontoLabel(before.sconto), after: formatScontoLabel(after.sconto) });
  }
  if (before.prezzoListino !== after.prezzoListino) {
    changes.push({
      field: "prezzoListino",
      before: `EUR ${before.prezzoListino.toFixed(2)}`,
      after: `EUR ${after.prezzoListino.toFixed(2)}`,
    });
  }
  return changes;
}

export function computeOrderDiff(previous: OrderSnapshot, current: OrderSnapshot): OrderDiff {
  const headerChanges: OrderDiff["headerChanges"] = [];
  const headerFields: Array<{ label: string; before: string; after: string }> = [
    { label: "Cliente", before: previous.cliente, after: current.cliente },
    { label: "Magazzino", before: previous.magazzino, after: current.magazzino },
    { label: "Luogo consegna", before: previous.luogoConsegna, after: current.luogoConsegna },
    { label: "CIG", before: previous.cig, after: current.cig },
    { label: "CUP", before: previous.cup, after: current.cup },
    { label: "Data consegna", before: formatDate(previous.dataConsegna), after: formatDate(current.dataConsegna) },
    { label: "Note", before: previous.note, after: current.note },
  ];
  for (const f of headerFields) {
    if ((f.before ?? "") !== (f.after ?? "")) headerChanges.push(f);
  }

  const beforeByKey = new Map(previous.items.map((item, index) => [lineKey(item, index), item]));
  const afterKeys = current.items.map((item, index) => lineKey(item, index));
  const afterKeySet = new Set(afterKeys);

  const added: OrderHistoryItem[] = [];
  const removed: OrderHistoryItem[] = [];
  const modified: ModifiedItem[] = [];
  const unchanged: OrderHistoryItem[] = [];

  current.items.forEach((after, index) => {
    const before = beforeByKey.get(afterKeys[index]);
    if (!before) {
      added.push(after);
      return;
    }
    const changes = diffItem(before, after);
    if (changes.length > 0) modified.push({ before, after, changes });
    else unchanged.push(after);
  });

  previous.items.forEach((before, index) => {
    if (!afterKeySet.has(lineKey(before, index))) removed.push(before);
  });

  const commonBefore = previous.items
    .map((item, index) => lineKey(item, index))
    .filter((key) => afterKeySet.has(key));
  const commonAfter = afterKeys.filter((key) => beforeByKey.has(key));
  const reordered = commonBefore.join("\u0000") !== commonAfter.join("\u0000");

  return { headerChanges, added, removed, modified, unchanged, reordered };
}

export function orderDiffHasChanges(diff: OrderDiff): boolean {
  return (
    diff.headerChanges.length > 0 ||
    diff.added.length > 0 ||
    diff.removed.length > 0 ||
    diff.modified.length > 0 ||
    diff.reordered
  );
}
