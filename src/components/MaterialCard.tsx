"use client";

import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus } from "lucide-react";
import { useOrderStore } from "@/lib/useOrderStore";
import type { Material } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  material: Material;
  isReadOnlyCatalog?: boolean;
}

export default function MaterialCard({ material, isReadOnlyCatalog = false }: Props) {
  const { codice, descrizione, descrizioneAI, um, prezzoListino, raggr, obsoleto } = material;
  const orderItem = useOrderStore((s) => s.orderItems[codice]);
  const setQty = useOrderStore((s) => s.setQty);

  const isFlagged = orderItem?.flagged ?? false;
  const qty = orderItem?.qty ?? 0;
  const [expanded, setExpanded] = useState(false);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const showQtyRow = expanded || isFlagged;

  const handleQtyChange = (value: string) => {
    const parsed = parseInt(value, 10);
    setQty(codice, isNaN(parsed) ? 0 : parsed);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-200 select-none overflow-hidden flex",
        isFlagged
          ? "border-primary/35 bg-card shadow-md shadow-primary/10"
          : "border-border bg-card shadow-sm hover:shadow-md hover:border-border/80",
        obsoleto && (isFlagged ? "bg-muted/35" : "bg-muted/40 border-border/70")
      )}
    >
      {/* Colored left accent strip when flagged */}
      <div className={cn(
        "w-1 shrink-0 rounded-l-2xl transition-all duration-200",
        isFlagged ? "bg-gradient-to-b from-primary to-primary/50" : "bg-transparent"
      )} />

      <div className="p-4 flex-1 min-w-0">
        {/* Top row: checkbox + codice + badge pz/bancale */}
        <div className="flex items-start gap-3">
          {!isReadOnlyCatalog && (
            <Checkbox
              id={`flag-${codice}`}
              checked={isFlagged}
              onCheckedChange={(checked) => {
                if (checked) {
                  setExpanded(true);
                } else {
                  setQty(codice, 0);
                  setExpanded(false);
                }
              }}
              className="mt-1 h-5 w-5 shrink-0"
            />
          )}
          <label
            htmlFor={""}
            onClick={() => {
              if (!isReadOnlyCatalog && qty === 0) {
                setExpanded((v) => !v);
              }
            }}
            className={cn("flex-1 min-w-0", !isReadOnlyCatalog && qty === 0 && "cursor-pointer")}
          >
            {/* Codice + badges */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn(
                "font-bold text-sm tracking-wide font-mono leading-tight",
                obsoleto ? "text-muted-foreground" : "text-foreground"
              )}>
                {codice}
              </span>
              {obsoleto && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 h-5 shrink-0 uppercase tracking-wide border-muted-foreground/30 text-muted-foreground bg-background/70"
                >
                  Obsoleto
                </Badge>
              )}
              {um && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs px-2 py-0 h-5 shrink-0 font-medium",
                    obsoleto && "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  U.M.: {um}
                </Badge>
              )}
            </div>

            {/* Descrizione AI (primaria - grande e visibile) */}
            <p className={cn(
              "text-sm leading-snug break-words mt-0.5 font-medium",
              obsoleto ? "text-muted-foreground" : "text-foreground/90"
            )}>
              {descrizioneAI || descrizione}
            </p>
            {/* Descrizione originale (secondaria - piccola e grigia) */}
            {descrizioneAI && descrizione && (
              <p className="text-xs text-muted-foreground/70 leading-snug break-words mt-1 italic">
                {descrizione}
              </p>
            )}

            {/* Prezzi */}
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <div className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1",
                obsoleto ? "bg-background/70" : "bg-muted"
              )}>
                <span className="text-xs text-muted-foreground font-medium">Listino</span>
                <span className={cn(
                  "text-xs font-bold",
                  obsoleto ? "text-muted-foreground" : "text-foreground"
                )}>€{prezzoListino.toFixed(3)}</span>
              </div>
              {raggr && (
                <span className={cn(
                  "text-xs font-medium",
                  obsoleto ? "text-muted-foreground/85" : "text-muted-foreground/70"
                )}>{raggr}</span>
              )}
            </div>
          </label>
        </div>

        {/* Quantity row — shown when expanded or flagged, hidden in catalog mode */}
        {!isReadOnlyCatalog && showQtyRow && (
          <div className="mt-4 flex items-center gap-3 pl-8">
            <span className="text-sm font-medium text-muted-foreground shrink-0">Qtà ordine:</span>
            <div className="flex items-center rounded-xl border border-primary/30 bg-background overflow-hidden shadow-sm">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQty(codice, qty - 1)}
                className="flex items-center justify-center h-10 w-11 text-primary hover:bg-primary/8 active:bg-primary/15 transition-colors"
                aria-label="Diminuisci quantità"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                ref={qtyInputRef}
                type="number"
                min={0}
                value={qty === 0 ? "" : qty}
                onChange={(e) => handleQtyChange(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value === "" || e.target.value === "0") {
                    setQty(codice, 0);
                    setExpanded(false);
                  }
                }}
                placeholder="0"
                inputMode="numeric"
                className="w-14 h-10 text-center font-bold bg-background border-x border-primary/30 focus:outline-none focus:bg-primary/5"
                style={{ fontSize: "16px" }}
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQty(codice, qty + 1)}
                className="flex items-center justify-center h-10 w-11 text-primary hover:bg-primary/8 active:bg-primary/15 transition-colors"
                aria-label="Aumenta quantità"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {um && (
              <span className="text-xs font-semibold text-muted-foreground">{um}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
