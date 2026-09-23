"use client";

import { useState } from "react";
import { PRESET_DISCOUNTS, isPresetDiscount } from "@/lib/order-lines";
import { formatSconto } from "@/lib/order-totals";
import { cn, parseLocalizedNumber } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** "sm" compatta per le righe dell'editor, "lg" a griglia con pulsanti da 44 px per il touch. */
  size?: "sm" | "md" | "lg";
  onInteract?: () => void;
}

function clampPercent(raw: string): number {
  const parsed = parseLocalizedNumber(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.min(100, Math.max(0, parsed)) * 100) / 100;
}

/**
 * Selettore sconto: preset (0 / 8% / 15%) più "Libero" con percentuale a mano.
 * Uno sconto libero fa passare ordine e preventivo dall'approvazione di un amministratore.
 */
export default function DiscountSelector({ value, onChange, size = "md", onInteract }: Props) {
  // "Libero" resta attivo anche se il valore digitato coincide con un preset o è ancora vuoto.
  const [freeMode, setFreeMode] = useState(() => !isPresetDiscount(value));
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const showFree = freeMode || !isPresetDiscount(value);
  const isLarge = size === "lg";
  const buttonClass = size === "sm" ? "h-6 px-2 text-[11px]" : isLarge ? "h-11 px-2 text-sm" : "h-7 px-2.5 text-xs";
  const displayValue = focused ? text : value > 0 ? formatSconto(value) : "";

  return (
    <div className={cn(isLarge ? "grid grid-cols-4 gap-1.5" : "flex flex-wrap items-center gap-1.5")} role="group" aria-label="Sconto">
      {PRESET_DISCOUNTS.map((pct) => {
        const selected = !showFree && value === pct;
        return (
          <button
            key={pct}
            type="button"
            onClick={() => {
              onInteract?.();
              setFreeMode(false);
              onChange(pct);
            }}
            className={cn(
              "rounded-md font-semibold border transition-colors",
              buttonClass,
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-input text-foreground/75 hover:border-primary/50 hover:text-foreground"
            )}
          >
            {pct === 0 ? "Nessuno" : `-${formatSconto(pct)}%`}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => {
          onInteract?.();
          setFreeMode(true);
        }}
        title="Sconto libero: richiede l'approvazione di un amministratore"
        className={cn(
          "rounded-md font-semibold border transition-colors",
          buttonClass,
          showFree
            ? "bg-amber-500 text-white border-amber-500"
            : "bg-card border-dashed border-amber-500/70 text-amber-800 hover:border-amber-500 dark:text-amber-300"
        )}
      >
        Libero
      </button>
      {showFree && (
        <span className={cn("inline-flex items-center gap-1", isLarge && "col-span-4 gap-2")}>
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            placeholder="0"
            aria-label="Percentuale di sconto libero"
            autoFocus={freeMode}
            onFocus={() => {
              setText(value > 0 ? formatSconto(value) : "");
              setFocused(true);
            }}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setText(event.target.value);
              onChange(clampPercent(event.target.value));
            }}
            className={cn(
              "w-16 rounded-lg border border-amber-400 bg-background px-2 text-center font-bold text-foreground focus:outline-none focus:ring-[3px] focus:ring-amber-400/40",
              size === "sm" ? "h-7 text-xs" : isLarge ? "h-11 w-24 text-sm" : "h-8 text-sm"
            )}
            style={{ fontSize: "16px" }}
          />
          <span className="text-xs font-semibold text-muted-foreground">%</span>
          {isLarge && <span className="text-xs text-amber-800 dark:text-amber-300">Richiede l&apos;approvazione di un amministratore</span>}
        </span>
      )}
    </div>
  );
}
