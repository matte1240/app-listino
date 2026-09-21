"use client";

import { PRESET_DISCOUNTS } from "@/lib/order-lines";
import { formatSconto } from "@/lib/order-totals";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** Dimensione compatta per le righe dell'editor. */
  size?: "sm" | "md";
  onInteract?: () => void;
}

/** Selettore sconto con i preset (0 / 8% / 15%). */
export default function DiscountSelector({ value, onChange, size = "md", onInteract }: Props) {
  const buttonClass = size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs";

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sconto">
      {PRESET_DISCOUNTS.map((pct) => {
        const selected = value === pct;
        return (
          <button
            key={pct}
            type="button"
            onClick={() => {
              onInteract?.();
              onChange(pct);
            }}
            className={cn(
              "rounded-lg font-semibold border transition-colors",
              buttonClass,
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {pct === 0 ? "Nessuno" : `-${formatSconto(pct)}%`}
          </button>
        );
      })}
    </div>
  );
}
