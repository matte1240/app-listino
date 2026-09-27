"use client";

import { MessageSquare, Truck } from "lucide-react";
import type { OrderHistoryItem } from "@/types";
import { getLineType, lineRequiresApproval } from "@/lib/order-lines";
import { formatOrderCurrency, formatQuantity, formatSconto, formatUnitPrice, getDiscountedUnitPrice, getLineTotal } from "@/lib/order-totals";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

interface Props {
  item: OrderHistoryItem;
  /** "order": prezzo unitario listino/scontato; "quotation": prezzo unitario + importo riga. */
  variant?: "order" | "quotation";
  /** Evidenzia le righe con sconto libero (pagina approvazioni). */
  highlightApproval?: boolean;
  /** Classi aggiuntive (es. padding orizzontale allineato al contenitore). */
  className?: string;
}

/** Riga di sola lettura per liste e dettagli: gestisce articoli, manuali, note e trasporto. */
export default function OrderLineRow({ item, variant = "order", highlightApproval = false, className }: Props) {
  const tipo = getLineType(item);
  const needsApproval = highlightApproval && lineRequiresApproval(item);

  if (tipo === "commento") {
    return (
      <div className={cn("px-4 py-2.5", className)}>
        <p className="inline-flex max-w-full items-start gap-2 rounded-lg bg-muted/70 px-3 py-1.5 text-[13px] text-foreground/75 italic">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="whitespace-pre-wrap">{item.descrizione}</span>
        </p>
      </div>
    );
  }

  const isTrasporto = tipo === "trasporto";
  const isManuale = tipo === "manuale";
  const sconto = item.sconto ?? 0;

  // Layout in base alla larghezza della riga (container query), non del viewport: nei pannelli
  // stretti (dettaglio laterale su tablet) prezzi e importo vanno sotto la descrizione.
  return (
    <div className={cn("@container px-4 py-3", needsApproval && "bg-amber-50 dark:bg-amber-950/20", className)}>
      <div className="flex flex-col gap-2 @lg:flex-row @lg:items-start @lg:gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
            {isTrasporto && <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">{item.codice}</span>
            {isManuale && (
              <span className="rounded bg-muted px-1.5 font-sans text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">manuale</span>
            )}
            {needsApproval && (
              <span className="rounded bg-amber-200 px-1.5 font-sans text-[10px] font-semibold tracking-wide text-amber-900 uppercase">sconto libero</span>
            )}
          </p>
          <p className="mt-0.5 text-sm leading-snug font-semibold text-foreground">{item.descrizione}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums @lg:shrink-0 @lg:justify-end @lg:pt-3">
          {!isTrasporto && (
            <span className="text-foreground">
              <strong className="font-bold">{formatQuantity(item.qty)}</strong> <span className="text-muted-foreground">{item.um}</span>
            </span>
          )}
          {isTrasporto ? null : variant === "order" ? (
            sconto > 0 ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground/70 line-through">{formatUnitPrice(item.prezzoListino)}</span>
                <span className="font-semibold text-foreground/85">{formatUnitPrice(getDiscountedUnitPrice(item))}</span>
                <Chip tone="primary" className="h-5 px-2 text-[11px]">−{formatSconto(sconto)}%</Chip>
              </span>
            ) : (
              <span className="text-muted-foreground">{formatUnitPrice(item.prezzoListino)}</span>
            )
          ) : (
            <>
              <span className="text-muted-foreground">{formatOrderCurrency(item.prezzoListino)}</span>
              {sconto > 0 && <Chip tone="primary" className="h-5 px-2 text-[11px]">−{formatSconto(sconto)}%</Chip>}
            </>
          )}
          <span className="ml-auto min-w-[5.5rem] text-right text-sm font-bold text-foreground">{formatOrderCurrency(getLineTotal(item))}</span>
        </div>
      </div>
    </div>
  );
}
