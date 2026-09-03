"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import SearchBar from "@/components/SearchBar";
import MaterialList from "@/components/MaterialList";
import { Button } from "@/components/ui/button";
import { useOrderStore } from "@/lib/useOrderStore";
import { useAuth } from "@/lib/auth-context";
import {
  DISCOUNT_8_MULTIPLIER,
  DISCOUNT_15_MULTIPLIER,
  exportListinoToExcel,
  groupByCategoria,
} from "@/lib/listino-export";

function formatPrice(value: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Home() {
  const materials = useOrderStore((s) => s.materials);
  const setMaterials = useOrderStore((s) => s.setMaterials);
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const [exporting, setExporting] = useState(false);
  const headerCellClass = "border border-black px-2 py-1";
  const bodyCellClass = "border border-black px-2 py-1";

  const grouped = useMemo(() => groupByCategoria(materials), [materials]);

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      await exportListinoToExcel(materials);
    } catch (error) {
      console.error("[listino] Errore export Excel:", error);
      toast.error("Errore durante l'esportazione in Excel");
    } finally {
      setExporting(false);
    }
  }, [materials]);

  // Load materials if not yet loaded
  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div className="no-print min-h-dvh flex flex-col">
        <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md border-b border-border/60">
          <div className="max-w-2xl mx-auto px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchBar />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={materials.length === 0}
              className="gap-2 justify-center sm:shrink-0"
            >
              <Printer className="h-4 w-4" />
              Esporta PDF
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={materials.length === 0 || exporting}
                className="gap-2 justify-center sm:shrink-0"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exporting ? "Esportazione..." : "Esporta Excel"}
              </Button>
            )}
          </div>
        </div>

        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
          <MaterialList isReadOnlyCatalog={true} />
        </main>
      </div>

      <main className="print-only max-w-6xl mx-auto w-full px-3 sm:px-4 py-5 md:py-8">
        <section className="listino-sheet rounded-xl border bg-white text-black p-3 sm:p-4 md:p-6">
          <div className="flex justify-center mb-4">
            <Image
              src="/IVICOLORS_marchio.png"
              alt="IVI Colors"
              width={230}
              height={74}
              className="h-14 w-auto object-contain"
            />
          </div>

          <div className="space-y-4">
            {grouped.map(([categoria, items]) => (
              <div key={categoria}>
                <div className="bg-sky-200 border border-black border-b-0 px-3 py-1.5 text-center font-bold text-sm tracking-wide uppercase">
                  {categoria}
                </div>

                <div className="listino-table-desktop overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className={`${headerCellClass} text-left w-[14%]`}>Codice articolo</th>
                        <th className={`${headerCellClass} text-left`}>Descrizione articolo</th>
                        <th className={`${headerCellClass} text-right w-[12%]`}>Prezzo listino</th>
                        <th className={`${headerCellClass} text-right w-[10%] text-red-700`}>Sconto 8%</th>
                        <th className={`${headerCellClass} text-right w-[10%] text-red-700`}>Sconto 15%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const prezzo = item.prezzoListino || 0;
                        const sconto8 = prezzo * DISCOUNT_8_MULTIPLIER;
                        const sconto15 = prezzo * DISCOUNT_15_MULTIPLIER;
                        const rowClass = item.obsoleto ? "bg-slate-50 text-slate-500 line-through" : "";
                        const priceClass = item.obsoleto ? "text-slate-500" : "text-red-700";
                        return (
                          <tr key={item.codice} className={rowClass}>
                            <td className={`${bodyCellClass} font-semibold`}>{item.codice}</td>
                            <td className={bodyCellClass} title={item.descrizioneAI || item.descrizione}>
                              <span className="align-middle">{item.descrizioneAI || item.descrizione}</span>
                              {item.obsoleto && (
                                <span className="ml-2 inline-block rounded border border-slate-400 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-700 no-underline align-middle">
                                  OBSOLETO
                                </span>
                              )}
                            </td>
                            <td className={`${bodyCellClass} text-right font-semibold`}>{formatPrice(prezzo)}</td>
                            <td className={`${bodyCellClass} text-right ${priceClass} font-semibold`}>{formatPrice(sconto8)}</td>
                            <td className={`${bodyCellClass} text-right ${priceClass} font-semibold`}>{formatPrice(sconto15)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
