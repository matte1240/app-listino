"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Clock, FileText, Hourglass, Loader2, Package, Pencil, Plus, Printer, ShieldAlert, ShoppingCart, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/lib/auth-context";
import OrderLineRow from "@/components/OrderLineRow";
import PageHeader from "@/components/PageHeader";
import SearchField from "@/components/SearchField";
import SegmentedTabs from "@/components/SegmentedTabs";
import { cn } from "@/lib/utils";
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
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6 pb-24 lg:max-w-3xl lg:px-10 lg:pt-8 lg:pb-8">
        <PageHeader
          eyebrow="Offerte ai clienti"
          title="Preventivi"
          actions={
            <Button size="lg" className="hidden lg:inline-flex" onClick={() => router.push("/quotations/new")}>
              <Plus className="size-5" />
              Nuovo preventivo
            </Button>
          }
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField
            className="sm:flex-1"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Cerca per numero, cliente, agente"
            ariaLabel="Cerca preventivi"
          />
          <SegmentedTabs
            className="sm:w-72"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "attivi", label: "Attivi", count: quotationCounts.attivi },
              { value: "convertiti", label: "Trasformati", count: quotationCounts.convertiti },
            ]}
          />
        </div>

        {filteredQuotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <FileText className="h-7 w-7 text-primary" />
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
              <article
                key={quotation.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card shadow-card transition-[border-color,box-shadow]",
                  isOpen ? "border-primary ring-4 ring-primary/10" : "border-border/80"
                )}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
                  onClick={() => setExpanded(isOpen ? null : quotation.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{quotation.numero} · {formatDate(quotation.dataPreventivo)}</p>
                      <p className="mt-0.5 text-base leading-snug font-bold text-foreground">{quotation.cliente}</p>
                    </div>
                    <span className="shrink-0 text-base font-bold whitespace-nowrap tabular-nums text-foreground">{formatCurrency(quotationTotal(quotation))}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {quotation.status === "attivo" && <Chip tone="primary" dot>Attivo</Chip>}
                    {quotation.status === "convertito" && <Chip tone="success"><CheckCircle2 /> Ordine creato</Chip>}
                    {quotation.status === "in_approvazione" && <Chip tone="orange"><Hourglass /> In approvazione</Chip>}
                    {quotation.status === "rifiutato" && <Chip tone="danger"><ShieldAlert /> Rifiutato</Chip>}
                    {user?.role === "admin" && <span className="text-xs text-muted-foreground">{quotation.agenteFullName || quotation.agente}</span>}
                  </div>
                  <div className="flex items-center gap-x-4 border-t border-border/70 pt-2.5 text-[13px] text-muted-foreground">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        {articleCount} art. · {totalQty} pz
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Valido {quotation.validitaGiorni} gg
                      </span>
                      {quotation.dataConsegnaPrevista && (
                        <span className="inline-flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5" />
                          Consegna {formatDate(quotation.dataConsegnaPrevista)}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    {quotation.status === "in_approvazione" && (
                      <div className="px-4 py-3 bg-orange-50 text-xs text-orange-800 border-b border-orange-200 dark:bg-orange-950/30 dark:text-orange-300">
                        In attesa di approvazione di un amministratore per gli sconti liberi: PDF e trasformazione in ordine saranno disponibili dopo l&apos;approvazione.
                      </div>
                    )}
                    {quotation.status === "rifiutato" && (
                      <div className="px-4 py-3 bg-red-50 text-xs text-red-800 border-b border-red-200 dark:bg-red-950/30 dark:text-red-300">
                        <strong>Rifiutato{quotation.approvalDecidedBy ? ` da ${quotation.approvalDecidedBy}` : ""}:</strong> {quotation.approvalNote || "nessuna motivazione"}. Modifica gli sconti e salva per una nuova valutazione.
                      </div>
                    )}
                    {quotation.note && (
                      <div className="px-4 py-3 bg-muted/50 text-sm text-foreground/85 border-b border-border">
                        <strong>Note:</strong> {quotation.note}
                      </div>
                    )}

                    <div className="divide-y divide-border/70">
                      {quotation.items.map((item, index) => (
                        <OrderLineRow key={item.id ?? `${item.codice}-${index}`} item={item} variant="quotation" />
                      ))}
                    </div>

                    {showDeleteConfirm && (
                      <div className="px-4 py-4 border-t border-destructive/30 bg-destructive/5">
                        <p className="text-sm font-semibold text-destructive">Eliminare il preventivo {quotation.numero}?</p>
                        <p className="text-xs text-muted-foreground mt-1">Questa azione non è reversibile.</p>
                        <div className="flex flex-col gap-2 mt-3 sm:flex-row">
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(quotation.id)} disabled={deleting} className="w-full justify-center sm:w-auto">
                            {deleting ? <><Loader2 className="animate-spin" /> Eliminazione...</> : <><Trash2 /> Conferma</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting} className="w-full justify-center sm:w-auto">
                            Annulla
                          </Button>
                        </div>
                      </div>
                    )}

                    {!showDeleteConfirm && (
                      <div className="px-4 py-3.5 border-t border-border flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <Button variant="outline" size="sm" onClick={() => router.push(`/quotations/${quotation.id}`)} className="w-full justify-center sm:w-auto">
                          <FileText /> Dettaglio
                        </Button>
                        {quotation.status === "convertito" && quotation.convertedOrderId ? (
                          <Button variant="outline" size="sm" onClick={() => router.push(`/orders`)} className="text-primary w-full justify-center sm:w-auto">
                            <ShoppingCart /> Apri ordine
                          </Button>
                        ) : quotation.status === "attivo" ? (
                          <Button size="sm" onClick={() => router.push(`/orders/new?fromQuotationId=${quotation.id}`)} className="w-full justify-center sm:order-last sm:w-auto">
                            <ShoppingCart /> Ordine
                          </Button>
                        ) : null}
                        {(quotation.status === "attivo" || quotation.status === "convertito" || user?.role === "admin") && (
                          <Button variant="outline" size="sm" onClick={() => router.push(`/quotations/${quotation.id}/print`)} className="text-primary w-full justify-center sm:w-auto">
                            <Printer /> PDF
                          </Button>
                        )}
                        {quotation.status !== "convertito" && (
                          <Button variant="outline" size="sm" onClick={() => router.push(`/quotations/${quotation.id}/edit`)} className="text-primary w-full justify-center sm:w-auto">
                            <Pencil /> Modifica
                          </Button>
                        )}
                        <Button variant="destructive-soft" size="sm" onClick={() => setDeleteConfirm(quotation.id)} className="w-full justify-center sm:order-first sm:mr-auto sm:w-auto">
                          <Trash2 /> Elimina
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </main>

      <Link
        href="/quotations/new"
        className="no-print fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary pr-5 pl-4 text-[15px] font-semibold text-primary-foreground shadow-primary transition-colors hover:bg-primary-hover lg:hidden"
      >
        <Plus className="h-5 w-5" />
        Nuovo preventivo
      </Link>
    </div>
  );
}