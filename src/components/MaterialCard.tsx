"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus } from "lucide-react";
import { useOrderStore } from "@/lib/useOrderStore";
import type { Material } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  material: Material;
}

export default function MaterialCard({ material }: Props) {
  const { codice, descrizione, quantita, pzBancale } = material;
  const orderItem = useOrderStore((s) => s.orderItems[codice]);
  const toggleFlag = useOrderStore((s) => s.toggleFlag);
  const setQty = useOrderStore((s) => s.setQty);

  const isFlagged = orderItem?.flagged ?? false;
  const qty = orderItem?.qty ?? 0;

  const handleQtyChange = (value: string) => {
    const parsed = parseInt(value, 10);
    setQty(codice, isNaN(parsed) ? 0 : parsed);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-200 select-none overflow-hidden",
        isFlagged
          ? "border-primary/40 bg-card shadow-md shadow-primary/8"
          : "border-border bg-card shadow-sm"
      )}
    >
      {/* Colored left accent strip when flagged */}
      {isFlagged && (
        <div className="h-1 w-full bg-gradient-to-r from-primary to-primary/60" />
      )}

      <div className="p-4">
        {/* Top row: checkbox + codice + badge pz/bancale */}
        <div className="flex items-start gap-3">
          <Checkbox
            id={`flag-${codice}`}
            checked={isFlagged}
            onCheckedChange={() => toggleFlag(codice)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <label
            htmlFor={`flag-${codice}`}
            className="flex-1 cursor-pointer min-w-0"
          >
            {/* Codice + badge */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-sm tracking-wide text-foreground font-mono leading-tight">
                {codice}
              </span>
              {pzBancale > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs px-2 py-0 h-5 shrink-0 font-medium"
                >
                  {pzBancale} pz/conf
                </Badge>
              )}
            </div>

            {/* Descrizione */}
            <p className="text-sm text-foreground/80 leading-snug break-words">
              {descrizione}
            </p>

            {/* Disponibilità chip */}
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <span className="text-xs text-muted-foreground">Disp.</span>
              <span className="text-xs font-semibold text-foreground">{quantita}</span>
            </div>
          </label>
        </div>

        {/* Quantity row — shown only when flagged */}
        {isFlagged && (
          <div className="mt-4 flex items-center gap-3 pl-8">
            <span className="text-sm font-medium text-muted-foreground shrink-0">Qtà ordine:</span>
            <div className="flex items-center rounded-xl border border-primary/30 bg-background overflow-hidden shadow-sm">
              <button
                onClick={() => setQty(codice, qty - 1)}
                className="flex items-center justify-center h-10 w-11 text-primary hover:bg-primary/8 active:bg-primary/15 transition-colors"
                aria-label="Diminuisci quantità"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={0}
                value={qty === 0 ? "" : qty}
                onChange={(e) => handleQtyChange(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className="w-14 h-10 text-center font-bold bg-background border-x border-primary/30 focus:outline-none focus:bg-primary/5"
                style={{ fontSize: "16px" }}
              />
              <button
                onClick={() => setQty(codice, qty + 1)}
                className="flex items-center justify-center h-10 w-11 text-primary hover:bg-primary/8 active:bg-primary/15 transition-colors"
                aria-label="Aumenta quantità"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
