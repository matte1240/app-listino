"use client";

import { forwardRef, useState } from "react";
import { cn, parseLocalizedNumber } from "@/lib/utils";

/** Font 16px sugli input: evita lo zoom automatico di iOS al focus. */
export const IOS_FONT = { fontSize: "16px" } as const;

export function formatNumberInput(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return value.toLocaleString("it-IT", { maximumFractionDigits: 3, useGrouping: false });
}

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  /** Evidenzia il campo come non valido (bordo rosso + aria-invalid). */
  invalid?: boolean;
}

/** Campo numerico con virgola decimale: aggiorna il valore ad ogni digitazione, riformatta al blur. */
const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onCommit, placeholder, className, ariaLabel, autoFocus, onEnter, invalid = false },
  ref
) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  // Mentre il campo è attivo mostra il testo digitato (es. "12,"), altrimenti il valore formattato.
  const displayValue = focused ? text : formatNumberInput(value);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      autoFocus={autoFocus}
      onFocus={() => {
        setText(formatNumberInput(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value);
        onCommit(Math.max(0, parseLocalizedNumber(event.target.value)));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }}
      className={cn(
        "h-9 rounded-lg border border-border bg-card px-2 text-sm font-semibold text-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40",
        invalid && "border-destructive focus:border-destructive focus:ring-destructive/30",
        className
      )}
      style={IOS_FONT}
    />
  );
});

export default NumberField;
