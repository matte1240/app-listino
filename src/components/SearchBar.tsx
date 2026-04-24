"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrderStore } from "@/lib/useOrderStore";

export default function SearchBar() {
  const searchQuery = useOrderStore((s) => s.searchQuery);
  const setSearchQuery = useOrderStore((s) => s.setSearchQuery);
  const showObsolete = useOrderStore((s) => s.showObsolete);
  const setShowObsolete = useOrderStore((s) => s.setShowObsolete);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          inputMode="search"
          placeholder="Cerca codice o descrizione..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && searchQuery.length === 0) {
              e.stopPropagation();
            }
          }}
          className="pl-9 pr-9 text-base h-12 rounded-2xl bg-card border-border shadow-sm placeholder:text-muted-foreground/55 focus-visible:ring-primary/50"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Cancella ricerca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="inline-flex items-center gap-2 pl-1 text-xs text-muted-foreground select-none">
        <Checkbox
          id="show-obsolete"
          checked={showObsolete}
          onCheckedChange={(checked) => setShowObsolete(checked === true)}
          className="h-4 w-4"
        />
        <button
          type="button"
          onClick={() => setShowObsolete(!showObsolete)}
          className="hover:text-foreground transition-colors"
        >
          Mostra obsoleti
        </button>
      </div>
    </div>
  );
}
