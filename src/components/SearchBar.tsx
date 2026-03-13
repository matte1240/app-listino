"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useOrderStore } from "@/lib/useOrderStore";

export default function SearchBar() {
  const searchQuery = useOrderStore((s) => s.searchQuery);
  const setSearchQuery = useOrderStore((s) => s.setSearchQuery);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        inputMode="search"
        placeholder="Cerca codice o descrizione..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
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
  );
}
