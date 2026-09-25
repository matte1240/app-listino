"use client";

import { useMemo, useRef, type CSSProperties } from "react";
import { PackagePlus, PackageSearch } from "lucide-react";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";
import MaterialCard from "@/components/MaterialCard";
import CategoryTimeline from "@/components/CategoryTimeline";
import type { Material } from "@/types";
import { cn } from "@/lib/utils";

function materialSearchText(m: Material): string {
  return `${m.codice} ${m.descrizione} ${m.descrizioneAI ?? ""} ${m.categoria} ${m.raggr} ${m.um}`.toLowerCase();
}

interface Props {
  isReadOnlyCatalog?: boolean;
  store?: "order" | "quotation";
  onArticleConfirmed?: () => void;
  openArticleRequest?: { codice: string; requestId: number } | null;
  onOpenArticleRequestHandled?: (requestId: number) => void;
  /** "Nessun risultato": apre la casella righe manuali con la descrizione precompilata dal testo cercato. */
  onCreateManualFromSearch?: (descrizione: string) => void;
  /** Altezza di ciò che resta fisso in cima scorrendo (espressione CSS): serve ad allineare la timeline e i salti di categoria. */
  stickyTop?: string;
}

export default function MaterialList({
  isReadOnlyCatalog = false,
  store = "order",
  onArticleConfirmed,
  openArticleRequest,
  onOpenArticleRequestHandled,
  onCreateManualFromSearch,
  stickyTop = "var(--app-header-h)",
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const orderMaterials = useOrderStore((s) => s.materials);
  const orderSearchQuery = useOrderStore((s) => s.searchQuery);
  const orderShowObsolete = useOrderStore((s) => s.showObsolete);
  const quotationMaterials = useQuotationStore((s) => s.materials);
  const quotationSearchQuery = useQuotationStore((s) => s.searchQuery);
  const quotationShowObsolete = useQuotationStore((s) => s.showObsolete);

  const materials = store === "quotation" ? quotationMaterials : orderMaterials;
  const searchQuery = store === "quotation" ? quotationSearchQuery : orderSearchQuery;
  const showObsolete = store === "quotation" ? quotationShowObsolete : orderShowObsolete;

  const filtered = useMemo(() => {
    const source = showObsolete ? materials : materials.filter((m) => !m.obsoleto);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;
    const tokens = q.split(/\s+/).filter(Boolean);
    return source.filter((m) => {
      const haystack = materialSearchText(m);
      return tokens.every((t) => haystack.includes(t));
    });
  }, [materials, searchQuery, showObsolete]);

  const hiddenObsoleteCount = useMemo(() => {
    if (showObsolete) return 0;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return materials.filter((m) => m.obsoleto).length;

    const tokens = q.split(/\s+/).filter(Boolean);
    return materials.filter((m) => {
      if (!m.obsoleto) return false;
      const haystack = materialSearchText(m);
      return tokens.every((t) => haystack.includes(t));
    }).length;
  }, [materials, searchQuery, showObsolete]);

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

  const timelineCategories = useMemo(
    () => Array.from(grouped, ([label, items]) => ({ label, count: items.length })),
    [grouped]
  );

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
          <PackageSearch className="h-7 w-7 text-primary" />
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
      <div className="flex flex-col gap-1">
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
            <PackageSearch className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Nessun risultato</p>
            <p className="text-sm text-muted-foreground mt-1">
              Nessun articolo per &quot;{searchQuery}&quot;
            </p>
          </div>
          {!isReadOnlyCatalog && onCreateManualFromSearch && (
            <button
              type="button"
              onClick={() => onCreateManualFromSearch(searchQuery.trim())}
              className="h-11 px-4 rounded-lg border border-primary/20 bg-secondary text-sm font-semibold text-primary hover:border-primary/40 transition-colors inline-flex items-center gap-2"
            >
              <PackagePlus className="h-4 w-4" />
              Inseriscilo come articolo manuale
            </button>
          )}
        </div>
      </div>
    );
  }

  const summaryLabel = searchQuery ? `articoli trovati per "${searchQuery}"` : "articoli nel listino";
  const hiddenLabel = !showObsolete && hiddenObsoleteCount > 0 ? ` · ${hiddenObsoleteCount} obsoleti nascosti` : "";

  return (
    // Su desktop la lista resta a una colonna e lo spazio laterale va alla timeline delle categorie
    // (solo se la colonna è abbastanza larga: nel wizard c'è anche il carrello).
    <div className="@container" style={{ "--catalog-sticky-top": `calc(${stickyTop})` } as CSSProperties}>
      <div className="grid grid-cols-1 gap-8 lg:@2xl:grid-cols-[minmax(0,1fr)_11rem]">
        <div ref={listRef} className="flex min-w-0 flex-col gap-6">
          <p className="px-1 text-[13px] text-muted-foreground">
            <strong className="font-bold text-foreground tabular-nums">{filtered.length.toLocaleString("it-IT")}</strong> {summaryLabel}
            {hiddenLabel}
          </p>

          {/* Sezioni per categoria */}
          {Array.from(grouped.entries()).map(([categoria, items]) => (
            <section
              key={categoria}
              data-catalog-section
              className="flex scroll-mt-[calc(var(--catalog-sticky-top)+1rem)] flex-col gap-3"
            >
              <div className="flex items-center gap-2.5 px-1">
                <h2 className="text-xs font-bold tracking-[0.1em] text-primary uppercase">{categoria}</h2>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{items.length}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className={cn("flex flex-col gap-2.5", isReadOnlyCatalog && "lg:gap-3")}>
                {items.map((material) => (
                  <MaterialCard
                    key={material.codice}
                    material={material}
                    isReadOnlyCatalog={isReadOnlyCatalog}
                    store={store}
                    onArticleConfirmed={onArticleConfirmed}
                    openArticleRequest={openArticleRequest}
                    onOpenArticleRequestHandled={onOpenArticleRequestHandled}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <CategoryTimeline categories={timelineCategories} listRef={listRef} className="hidden lg:@2xl:block" />
      </div>
    </div>
  );
}
