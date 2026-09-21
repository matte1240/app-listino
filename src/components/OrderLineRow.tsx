"use client";

import { MessageSquare, Truck } from "lucide-react";
import type { OrderHistoryItem } from "@/types";
import { getLineType } from "@/lib/order-lines";
import { formatOrderCurrency, formatSconto, getDiscountedUnitPrice, getLineTotal } from "@/lib/order-totals";

interface Props {
  item: OrderHistoryItem;
  /** "order": prezzo unitario listino/scontato; "quotation": prezzo unitario + importo riga. */
  variant?: "order" | "quotation";
}

/** Riga di sola lettura per liste e dettagli: gestisce articoli, manuali, note e trasporto. */
export default function OrderLineRow({ item, variant = "order" }: Props) {
  const tipo = getLineType(item);

  if (tipo === "commento") {
    return (
      <div className="flex items-start gap-2 px-4 py-2 bg-muted/40">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs italic text-muted-foreground whitespace-pre-wrap">{item.descrizione}</p>
      </div>
    );
  }

  const isTrasporto = tipo === "trasporto";
  const isManuale = tipo === "manuale";
  const sconto = item.sconto ?? 0;

  return (
    <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold font-mono text-foreground flex items-center gap-1.5">
          {isTrasporto && <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="truncate">{item.codice}</span>
          {isManuale && (
            <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide font-sans">manuale</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.descrizione}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs sm:shrink-0 sm:justify-end">
        {!isTrasporto && <span className="font-bold text-foreground">{item.qty}</span>}
        {!isTrasporto && <span className="text-muted-foreground">{item.um}</span>}
        {variant === "order" ? (
          sconto > 0 ? (
            <span className="flex flex-wrap items-center gap-1 sm:justify-end">
              <span className="line-through text-muted-foreground/50">€{item.prezzoListino.toFixed(3)}</span>
              <span className="font-semibold text-primary">€{getDiscountedUnitPrice(item).toFixed(3)}</span>
              <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{formatSconto(sconto)}%</span>
            </span>
          ) : (
            <span className="text-muted-foreground/60">€{item.prezzoListino.toFixed(3)}</span>
          )
        ) : (
          <>
            <span>{formatOrderCurrency(item.prezzoListino)}</span>
            {sconto > 0 && <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{formatSconto(sconto)}%</span>}
            <span className="font-semibold text-foreground">{formatOrderCurrency(getLineTotal(item))}</span>
          </>
        )}
      </div>
    </div>
  );
}
