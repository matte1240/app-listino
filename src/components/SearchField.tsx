"use client";

import { forwardRef, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** Campo di ricerca con icona e pulsante per svuotarlo. */
const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField(
  { value, onChange, placeholder, ariaLabel, autoFocus = false, className, onKeyDown },
  ref
) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        type="text"
        inputMode="search"
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-12 w-full rounded-lg border border-border bg-card pr-11 pl-11 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/12 md:text-[15px]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cancella ricerca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

export default SearchField;
