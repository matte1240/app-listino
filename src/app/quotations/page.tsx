"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, FileText, Hourglass, Loader2, Package, Pencil, Plus, Printer, Search, ShieldAlert, ShoppingCart, Trash2, Truck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import OrderLineRow from "@/components/OrderLineRow";
import { countArticleLines } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, calculateOrderTotalPieces, formatOrderCurrency } from "@/lib/order-totals";
import type { Quotation } from "@/types";

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const formatCurrency = formatOrderCurrency;

function quotationTotal(quotation: Quotation) {
  return calculateOrderDiscountedTotal(quotation.items);
}

type QuotationTab = "attivi" | "convertiti";

export default function QuotationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<QuotationTab>("attivi");

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

  const quotationCounts = useMemo(() => ({
    attivi: quotations.filter((quotation) => quotation.status !== "convertito").length,
    convertiti: quotations.filter((quotation) => quotation.status === "convertito").length,
  }), [quotations]);

  const filteredQuotations = useMemo(() => {
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const statusFiltered = quotations.filter((quotation) =>
      activeTab === "convertiti" ? quotation.status === "convertito" : quotation.status !== "convertito"
    );
    if (tokens.length === 0) return statusFiltered;

    return statusFiltered.filter((quotation) => {
      const searchText = `${quotation.numero} ${quotation.id} ${quotation.cliente} ${quotation.agenteFullName || quotation.agente} ${quotation.agente}`.toLowerCase();
      return tokens.every((token) => searchText.includes(token));
    });
  }, [activeTab, quotations, searchQuery]);

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

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("attivi")}
            className={`h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${activeTab === "attivi" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Attivi <span className="ml-1 text-xs font-normal">{quotationCounts.attivi}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("convertiti")}
            className={`h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${activeTab === "convertiti" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Trasformati <span className="ml-1 text-xs font-normal">{quotationCounts.convertiti}</span>
          </button>
        </div>

        {filteredQuotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <FileText className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nessun preventivo trovato</p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === "convertiti" ? "I preventivi trasformati in ordine appariranno qui" : "I preventivi attivi appariranno qui"}
              </p>
            </div>
          </div>
        ) : (
          filteredQuotations.map((quotation) => {
            const isOpen = expanded === quotation.id;
            const totalQty = calculateOrderTotalPieces(quotation.items);
            const articleCount = countArticleLines(quotation.items);
            const showDeleteConfirm = deleteConfirm === quotation.id;
            return (
              <div key={quotation.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <button className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors" onClick={() => setExpanded(isOpen ? null : quotation.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground leading-tight">{quotation.cliente}</span>
                      <Badge variant="outline" className="text-xs px-2 py-0 h-5">{quotation.numero}</Badge>
                      {quotation.status === "convertito" && <Badge className="text-xs px-2 py-0 h-5 gap-1"><CheckCircle2 className="h-3 w-3" /> Ordine creato</Badge>}
                      {quotation.status === "in_approvazione" && (
                        <Badge variant="outline" className="text-xs px-2 py-0 h-5 gap-1 text-orange-700 border-orange-300 bg-orange-50"><Hourglass className="h-3 w-3" /> In approvazione</Badge>
                      )}
                      {quotation.status === "rifiutato" && (
                        <Badge variant="outline" className="text-xs px-2 py-0 h-5 gap-1 text-red-700 border-red-300 bg-red-50"><ShieldAlert className="h-3 w-3" /> Rifiutato</Badge>
                      )}
                      {user?.role === "admin" && <span className="text-xs text-muted-foreground/70">{quotation.agenteFullName || quotation.agente}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                      <span className="text-xs text-muted-foreground">{formatDate(quotation.dataPreventivo)}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {articleCount} art. - {totalQty} pz
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Valido {quotation.validitaGiorni} gg
                      </span>
                      {quotation.dataConsegnaPrevista && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          Consegna {formatDate(quotation.dataConsegnaPrevista)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-foreground">{formatCurrency(quotationTotal(quotation))}</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    {quotation.status === "in_approvazione" && (
                      <div className="px-4 py-3 bg-orange-50 text-xs text-orange-800 border-b border-orange-200">
                        In attesa di approvazione di un amministratore per gli sconti liberi: PDF e trasformazione in ordine saranno disponibili dopo l&apos;approvazione.
                      </div>
                    )}
                    {quotation.status === "rifiutato" && (
                      <div className="px-4 py-3 bg-red-50 text-xs text-red-800 border-b border-red-200">
                        <strong>Rifiutato{quotation.approvalDecidedBy ? ` da ${quotation.approvalDecidedBy}` : ""}:</strong> {quotation.approvalNote || "nessuna motivazione"}. Modifica gli sconti e salva per una nuova valutazione.
                      </div>
                    )}
                    {quotation.note && (
                      <div className="px-4 py-3 bg-muted/30 text-xs text-muted-foreground border-b border-border">
                        <strong>Note:</strong> {quotation.note}
                      </div>
                    )}

                    <div className="divide-y divide-border/60">
                      {quotation.items.map((item, index) => (
                        <OrderLineRow key={item.id ?? `${item.codice}-${index}`} item={item} variant="quotation" />
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
                        {quotation.status === "convertito" && quotation.convertedOrderId ? (
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/orders`)} className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto">
                            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Apri ordine
                          </Button>
                        ) : quotation.status === "attivo" ? (
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/orders/new?fromQuotationId=${quotation.id}`)} className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto">
                            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Ordine
                          </Button>
                        ) : null}
                        {(quotation.status === "attivo" || quotation.status === "convertito" || user?.role === "admin") && (
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/quotations/${quotation.id}/print`)} className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto">
                            <Printer className="h-3.5 w-3.5 mr-1.5" /> PDF
                          </Button>
                        )}
                        {quotation.status !== "convertito" && (
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/quotations/${quotation.id}/edit`)} className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto">
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Modifica
                          </Button>
                        )}
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