import type { OrderHistoryItem } from "@/types";
import { isArticleLine, isPriceableLine } from "@/lib/order-lines";

export function getDiscountedUnitPrice(item: Pick<OrderHistoryItem, "prezzoListino" | "sconto">): number {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

/**
 * Arrotondamento ai centesimi come nella visualizzazione (541.905 → 541.91): passando dalla forma decimale
 * si evita che l'errore binario (541.90499…) faccia arrotondare per difetto.
 */
export function roundToCents(value: number): number {
  const cents = Math.round(Number(`${Math.abs(value).toFixed(10)}e2`));
  return (Math.sign(value) * cents) / 100;
}

/** Importo della riga, arrotondato ai centesimi (0 per le righe commento). */
export function getLineTotal(item: Pick<OrderHistoryItem, "tipo" | "prezzoListino" | "sconto" | "qty">): number {
  if (!isPriceableLine(item)) return 0;
  return roundToCents(getDiscountedUnitPrice(item) * item.qty);
}

/** Totale imponibile: somma degli importi di riga già arrotondati, così coincide con quanto mostrato riga per riga. */
export function calculateOrderDiscountedTotal(
  items: ReadonlyArray<Pick<OrderHistoryItem, "tipo" | "prezzoListino" | "sconto" | "qty">>
): number {
  return roundToCents(items.reduce((sum, item) => sum + getLineTotal(item), 0));
}

/** Quantità con la virgola decimale: 12.5 → "12,5". */
export function formatQuantity(value: number): string {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

/**
 * Quantità delle righe articolo/manuale sommate per unità di misura (unità diverse non si sommano):
 * [2 pz, 12,5 mq, 1 pz] → "3 pz · 12,5 mq". Stringa vuota senza righe articolo.
 */
export function formatOrderQuantitiesByUnit(items: ReadonlyArray<Pick<OrderHistoryItem, "tipo" | "qty" | "um">>): string {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!isArticleLine(item)) continue;
    const um = item.um?.trim().toLowerCase() || "pz";
    totals.set(um, (totals.get(um) ?? 0) + item.qty);
  }
  return Array.from(totals, ([um, qty]) => `${formatQuantity(qty)} ${um}`).join(" · ");
}

export function formatOrderCurrency(value: number): string {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/** Prezzo unitario di listino con tre decimali: 48.9 → "€ 48,900". */
export function formatUnitPrice(value: number): string {
  return `€ ${value.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

/** Percentuale di sconto senza zeri inutili: 8 → "8", 12.5 → "12,5". */
export function formatSconto(value: number | undefined): string {
  return (value ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** Etichetta sconto per riepiloghi ed email: "-12,5%" oppure "—". */
export function formatScontoLabel(value: number | undefined): string {
  return value && value > 0 ? `-${formatSconto(value)}%` : "—";
}
