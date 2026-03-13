"use client";

import { useMemo } from "react";
import { PackageSearch, Tag } from "lucide-react";
import { useOrderStore } from "@/lib/useOrderStore";
import MaterialCard from "@/components/MaterialCard";
import type { Material } from "@/types";

export default function MaterialList() {
  const materials = useOrderStore((s) => s.materials);
  const searchQuery = useOrderStore((s) => s.searchQuery);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return materials;
    const tokens = q.split(/\s+/).filter(Boolean);
    return materials.filter((m) => {
      const haystack = `${m.codice} ${m.descrizione} ${m.descrizioneAI ?? ""} ${m.categoria} ${m.raggr} ${m.um}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [materials, searchQuery]);

  // Group by category (maintain original Excel order of categories)
  const grouped = useMemo(() => {
    const map = new Map<string, Material[]>();
    for (const m of filtered) {
      const cat = m.categoria || "Altro";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(m);
    }
    return map;
  }, [filtered]);

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <PackageSearch className="h-9 w-9 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Nessun listino caricato</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-[220px] mx-auto">
            Usa il pulsante &quot;Carica Excel&quot; in alto per importare il tuo listino
          </p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <PackageSearch className="h-9 w-9 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Nessun risultato</p>
          <p className="text-sm text-muted-foreground mt-1">
            Nessun articolo per &quot;{searchQuery}&quot;
          </p>
        </div>
      </div>
    );
  }

  const totalLabel = searchQuery
    ? `${filtered.length} articoli trovati per "${searchQuery}"`
    : `${filtered.length} articoli nel listino`;

  return (
    <div className="flex flex-col gap-1">
      {/* Summary pill */}
      <div className="flex items-center gap-2 px-1 mb-3">
        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5">
          {filtered.length}
        </span>
        <p className="text-xs text-muted-foreground">{totalLabel}</p>
      </div>

      {/* Grouped sections */}
      {Array.from(grouped.entries()).map(([categoria, items]) => (
        <div key={categoria} className="mb-5">
          {/* Category header */}
          <div className="flex items-center gap-2.5 mb-3 px-0.5">
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-xl px-3 py-1">
              <Tag className="h-3 w-3 shrink-0" />
              <h2 className="text-xs font-bold tracking-tight">{categoria}</h2>
            </div>
            <span className="text-xs text-muted-foreground/70 font-medium tabular-nums">{items.length} art.</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {/* Cards */}
          <div className="flex flex-col gap-2.5">
            {items.map((material) => (
              <MaterialCard key={material.codice} material={material} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
