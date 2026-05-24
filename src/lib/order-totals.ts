import type { OrderHistoryItem } from "@/types";

export function getDiscountedUnitPrice(item: Pick<OrderHistoryItem, "prezzoListino" | "sconto">): number {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

export function calculateOrderDiscountedTotal(
  items: ReadonlyArray<Pick<OrderHistoryItem, "prezzoListino" | "sconto" | "qty">>
): number {
  return items.reduce((sum, item) => sum + getDiscountedUnitPrice(item) * item.qty, 0);
}

export function formatOrderCurrency(value: number): string {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}