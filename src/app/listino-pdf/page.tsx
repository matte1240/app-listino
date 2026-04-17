"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Printer, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { Material } from "@/types";

const DISCOUNT_8_MULTIPLIER = 0.92;
const DISCOUNT_15_MULTIPLIER = 0.85;

function formatPrice(value: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ListinoPdfPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetch("/api/materials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMaterials(data?.materials ?? []))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const grouped = useMemo(() => {
    const map = new Map<string, Material[]>();
    for (const material of materials.filter((m) => !m.obsoleto)) {
      const categoria = material.categoria?.trim() || "SENZA CATEGORIA";
      if (!map.has(categoria)) map.set(categoria, []);
      map.get(categoria)!.push(material);
    }
    return Array.from(map.entries());
  }, [materials]);

  const headerCellClass = "border border-black px-2 py-1";
  const bodyCellClass = "border border-black px-2 py-1";

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <PackageSearch className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <p className="font-semibold">Nessun listino disponibile</p>
          <p className="text-sm text-muted-foreground mt-1">Carica prima un file Excel dal pulsante in alto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="listino-pdf-page min-h-dvh bg-background">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          nav,
          .no-print {
            display: none !important;
          }
          .listino-sheet {
            margin: 0 !important;
            max-width: none !important;
            box-shadow: none !important;
            border: 0 !important;
          }
        }
      `}</style>

      <main className="max-w-6xl mx-auto px-4 py-5 md:py-8">
        <div className="no-print mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Listino PDF</h1>
            <p className="text-sm text-muted-foreground">Vista stampabile per consultazione in cantiere.</p>
          </div>
          <Button onClick={() => window.print()} className="rounded-xl gap-2">
            <Printer className="h-4 w-4" />
            Esporta PDF
          </Button>
        </div>

        <section className="listino-sheet rounded-xl border bg-white text-black p-4 md:p-6">
          <div className="flex justify-center mb-4">
            <Image
              src="/IVICOLORS_marchio.png"
              alt="IVI Colors"
              width={230}
              height={74}
              className="h-14 w-auto object-contain"
              priority
            />
          </div>

          <div className="space-y-4">
            {grouped.map(([categoria, items]) => (
              <div key={categoria}>
                <div className="bg-sky-200 border border-black border-b-0 px-3 py-1.5 text-center font-bold text-sm tracking-wide uppercase">
                  {categoria}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className={`${headerCellClass} text-left w-[14%]`}>codice articolo</th>
                        <th className={`${headerCellClass} text-left`}>descrizione articolo</th>
                        <th className={`${headerCellClass} text-right w-[12%]`}>prezzo listino</th>
                        <th className={`${headerCellClass} text-right w-[10%] text-red-700`}>sconto 8%</th>
                        <th className={`${headerCellClass} text-right w-[10%] text-red-700`}>sconto 15%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const prezzo = item.prezzoListino || 0;
                        const sconto8 = prezzo * DISCOUNT_8_MULTIPLIER;
                        const sconto15 = prezzo * DISCOUNT_15_MULTIPLIER;
                        return (
                          <tr key={item.codice}>
                            <td className={`${bodyCellClass} font-semibold`}>{item.codice}</td>
                            <td className={bodyCellClass}>{item.descrizioneAI || item.descrizione}</td>
                            <td className={`${bodyCellClass} text-right font-semibold`}>{formatPrice(prezzo)}</td>
                            <td className={`${bodyCellClass} text-right text-red-700 font-semibold`}>{formatPrice(sconto8)}</td>
                            <td className={`${bodyCellClass} text-right text-red-700 font-semibold`}>{formatPrice(sconto15)}</td>
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
