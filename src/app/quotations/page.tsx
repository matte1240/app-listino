"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileText, Loader2, Package, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { Quotation, QuotationItem } from "@/types";

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function discountedPrice(item: QuotationItem) {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function quotationTotal(quotation: Quotation) {
  return quotation.items.reduce((sum, item) => sum + discountedPrice(item) * item.qty, 0);
}

export default function QuotationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user) loadQuotations();
  }, [authLoading, user]);

  async function loadQuotations() {
    setLoading(true);
    try {
      const res = await fetch("/api/quotations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setQuotations(data.quotations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setQuotations((prev) => prev.filter((quotation) => quotation.id !== id));
        setDeleteConfirm(null);
        setExpanded(null);
      } else {
        alert("Errore nella cancellazione del preventivo");
      }
    } finally {
      setDeleting(false);
    }
  }

  const filteredQuotations = useMemo(() => {
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return quotations;

    return quotations.filter((quotation) => {
      const searchText = `${quotation.numero} ${quotation.id} ${quotation.cliente} ${quotation.agente}`.toLowerCase();
      return tokens.every((token) => searchText.includes(token));
    });
  }, [quotations, searchQuery]);

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-bold text-lg">Preventivi</h1>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/quotations/new")}>
            <Plus className="h-4 w-4" />
            Crea
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Cerca per numero, cliente, agente"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-9 pr-9 h-11 rounded-xl border border-border bg-card text-sm shadow-sm placeholder:text-muted-foreground/55 focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring transition-[color,box-shadow]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1" aria-label="Cancella ricerca">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {filteredQuotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <FileText className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nessun preventivo trovato</p>
              <p className="text-sm text-muted-foreground mt-1">I preventivi salvati appariranno qui</p>
            </div>
          </div>
        ) : (
          filteredQuotations.map((quotation) => {
            const isOpen = expanded === quotation.id;
            const totalQty = quotation.items.reduce((sum, item) => sum + item.qty, 0);
            const showDeleteConfirm = deleteConfirm === quotation.id;
            return (
              <div key={quotation.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <button className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors" onClick={() => setExpanded(isOpen ? null : quotation.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground leading-tight">{quotation.cliente}</span>
                      <Badge variant="outline" className="text-xs px-2 py-0 h-5">{quotation.numero}</Badge>
                      {user?.role === "admin" && <span className="text-xs text-muted-foreground/70">{quotation.agente}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                      <span className="text-xs text-muted-foreground">{formatDate(quotation.dataPreventivo)}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {quotation.items.length} art. - {totalQty} pz
                      </span>
                      <span className="text-xs font-semibold text-foreground">{formatCurrency(quotationTotal(quotation))}</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    {quotation.note && (
                      <div className="px-4 py-3 bg-muted/30 text-xs text-muted-foreground border-b border-border">
                        <strong>Note:</strong> {quotation.note}
                      </div>
                    )}

                    <div className="divide-y divide-border/60">
                      {quotation.items.map((item) => (
                        <div key={item.codice} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold font-mono text-foreground">{item.codice}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{item.descrizione}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs sm:shrink-0 sm:justify-end">
                            <span className="font-bold text-foreground">{item.qty}</span>
                            <span className="text-muted-foreground">{item.um}</span>
                            {(item.sconto ?? 0) > 0 && <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{item.sconto}%</span>}
                            <span className="font-semibold text-foreground">{formatCurrency(discountedPrice(item) * item.qty)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {showDeleteConfirm && (
                      <div className="px-4 py-4 border-t border-destructive/30 bg-destructive/5">
                        <p className="text-sm font-semibold text-destructive">Eliminare il preventivo {quotation.numero}?</p>
                        <p className="text-xs text-muted-foreground mt-1">Questa azione non è reversibile.</p>
                        <div className="flex flex-col gap-2 mt-3 sm:flex-row">
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(quotation.id)} disabled={deleting} className="text-xs h-8 w-full justify-center sm:w-auto">
                            {deleting ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Eliminazione...</> : <><Trash2 className="h-3 w-3 mr-1.5" /> Conferma</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting} className="text-xs h-8 w-full justify-center sm:w-auto">
                            Annulla
                          </Button>
                        </div>
                      </div>
                    )}

                    {!showDeleteConfirm && (
                      <div className="px-4 py-3 border-t border-border flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/quotations/${quotation.id}`)} className="text-xs w-full justify-center sm:w-auto">
                          <FileText className="h-3.5 w-3.5 mr-1.5" /> Dettaglio
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/quotations/${quotation.id}/print`)} className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto">
                          <Printer className="h-3.5 w-3.5 mr-1.5" /> PDF
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/quotations/${quotation.id}/edit`)} className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto">
                          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Modifica
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(quotation.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive text-xs w-full justify-center sm:w-auto">
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Elimina
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}