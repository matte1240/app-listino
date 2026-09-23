"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Controllo segmentato (es. Attivi / Annullati) con contatore per ogni scheda. */
export default function SegmentedTabs<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div
      className={cn("grid gap-1 rounded-xl bg-sunken p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold transition-all lg:h-10",
              active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                  active ? "bg-primary text-primary-foreground" : "bg-input text-foreground/80"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
