import type { OrderHistoryItem } from "@/types";
import { isArticleLine, isPriceableLine } from "@/lib/order-lines";

export function getDiscountedUnitPrice(item: Pick<OrderHistoryItem, "prezzoListino" | "sconto">): number {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

/** Importo della riga (0 per le righe commento). */
export function getLineTotal(item: Pick<OrderHistoryItem, "tipo" | "prezzoListino" | "sconto" | "qty">): number {
  if (!isPriceableLine(item)) return 0;
  return getDiscountedUnitPrice(item) * item.qty;
}

export function calculateOrderDiscountedTotal(
  items: ReadonlyArray<Pick<OrderHistoryItem, "tipo" | "prezzoListino" | "sconto" | "qty">>
): number {
  return items.reduce((sum, item) => sum + getLineTotal(item), 0);
}

/** Somma delle quantità delle sole righe articolo/manuale (esclude note e trasporto). */
export function calculateOrderTotalPieces(items: ReadonlyArray<Pick<OrderHistoryItem, "tipo" | "qty">>): number {
  return items.reduce((sum, item) => (isArticleLine(item) ? sum + item.qty : sum), 0);
}

export function formatOrderCurrency(value: number): string {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/** Percentuale di sconto senza zeri inutili: 8 → "8", 12.5 → "12,5". */
export function formatSconto(value: number | undefined): string {
  return (value ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** Etichetta sconto per riepiloghi ed email: "-12,5%" oppure "—". */
export function formatScontoLabel(value: number | undefined): string {
  return value && value > 0 ? `-${formatSconto(value)}%` : "—";
}
