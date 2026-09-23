"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FileText, Hourglass, Loader2, MapPin, MessageSquare, Package, Pencil, Plus, Printer, ShieldAlert, ShoppingCart, Trash2, Truck } from "lucide-react";
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

  const isAdmin = user?.role === "admin";
  const selectedQuotation = filteredQuotations.find((quotation) => quotation.id === expanded) ?? null;

  const renderStatusChip = (quotation: Quotation) => {
    switch (quotation.status) {
      case "attivo":
        return <Chip tone="primary" dot>Attivo</Chip>;
      case "convertito":
        return <Chip tone="success"><CheckCircle2 /> Ordine creato</Chip>;
      case "in_approvazione":
        return <Chip tone="orange"><Hourglass /> In approvazione</Chip>;
      case "rifiutato":
        return <Chip tone="danger"><ShieldAlert /> Rifiutato</Chip>;
    }
  };

  /** Dettaglio preventivo: in linea sotto la card su mobile, nel pannello laterale su desktop. */
  const renderQuotationDetail = (quotation: Quotation, inset: string) => {
    const totalQty = calculateOrderTotalPieces(quotation.items);
    const showDeleteConfirm = deleteConfirm === quotation.id;
    const meta: { label: string; value: string; wide?: boolean }[] = [
      { label: "Data", value: formatDate(quotation.dataPreventivo) },
      { label: "Validità", value: `${quotation.validitaGiorni} giorni` },
      ...(quotation.dataConsegnaPrevista ? [{ label: "Consegna prevista", value: formatDate(quotation.dataConsegnaPrevista) }] : []),
      ...(isAdmin ? [{ label: "Agente", value: quotation.agenteFullName || quotation.agente }] : []),
      { label: "Destinazione cantiere", value: quotation.luogoConsegna || "Stessa del cliente", wide: true },
    ];

    return (
      <div className="flex flex-col">
        <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 bg-muted/50 py-3.5 sm:grid-cols-4", inset)}>
          {meta.map((entry) => (
            <div key={entry.label} className={cn("min-w-0", entry.wide && "col-span-2")}>
              <dt className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{entry.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold break-words text-foreground">{entry.value}</dd>
            </div>
          ))}
        </dl>

        {quotation.note && (
          <div className={cn("flex items-start gap-2 border-t border-border/70 py-3 text-sm text-foreground/85", inset)}>
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="whitespace-pre-wrap"><strong className="font-bold">Note:</strong> {quotation.note}</span>
          </div>
        )}

        {(quotation.status === "in_approvazione" || quotation.status === "rifiutato") && (
          <div className={cn("flex flex-col gap-2 pt-3", inset)}>
            {quotation.status === "in_approvazione" && (
              <div className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2.5 text-xs text-orange-800 dark:bg-orange-950/30 dark:text-orange-300">
                <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>In attesa di approvazione di un amministratore per gli sconti liberi: PDF e trasformazione in ordine saranno disponibili dopo l&apos;approvazione.</span>
              </div>
            )}
            {quotation.status === "rifiutato" && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Rifiutato{quotation.approvalDecidedBy ? ` da ${quotation.approvalDecidedBy}` : ""}:</strong> {quotation.approvalNote || "nessuna motivazione"}. Modifica gli sconti e salva per una nuova valutazione.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Righe */}
        <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
          {quotation.items.map((item, index) => (
            <OrderLineRow key={item.id ?? `${item.codice}-${index}`} item={item} variant="quotation" className={inset} />
          ))}
        </div>

        <div className={cn("flex items-end justify-end gap-8 py-4", inset)}>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Totale pezzi</span>
            <span className="text-base font-bold tabular-nums">{totalQty}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Totale imponibile</span>
            <span className="font-display text-2xl leading-tight font-bold tabular-nums">{formatCurrency(quotationTotal(quotation))}</span>
          </div>
        </div>

        {showDeleteConfirm ? (
          <div className={cn("border-t border-destructive/25 bg-destructive/5 py-4", inset)}>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">Eliminare il preventivo {quotation.numero}?</p>
                <p className="mt-1 text-xs text-muted-foreground">Questa azione non è reversibile.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(quotation.id)} disabled={deleting} className="w-full justify-center sm:w-auto">
                    {deleting ? <><Loader2 className="animate-spin" /> Eliminazione...</> : <><Trash2 /> Sì, elimina</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting} className="w-full justify-center sm:w-auto">
                    Annulla
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("grid grid-cols-2 gap-2 border-t border-border py-3.5 sm:flex sm:flex-row sm:flex-wrap sm:justify-end", inset)}>
            <Button variant="destructive-soft" onClick={() => setDeleteConfirm(quotation.id)} className="w-full justify-center sm:order-first sm:mr-auto sm:w-auto">
              <Trash2 /> Elimina
            </Button>
            <Button variant="outline" onClick={() => router.push(`/quotations/${quotation.id}`)} className="w-full justify-center sm:w-auto">
              <FileText /> Dettaglio
            </Button>
            {(quotation.status === "attivo" || quotation.status === "convertito" || isAdmin) && (
              <Button variant="outline" onClick={() => router.push(`/quotations/${quotation.id}/print`)} className="w-full justify-center text-primary sm:w-auto">
                <Printer /> PDF
              </Button>
            )}
            {quotation.status !== "convertito" && (
              <Button variant="outline" onClick={() => router.push(`/quotations/${quotation.id}/edit`)} className="w-full justify-center text-primary sm:w-auto">
                <Pencil /> Modifica
              </Button>
            )}
            {quotation.status === "convertito" && quotation.convertedOrderId ? (
              <Button variant="outline" onClick={() => router.push(`/orders`)} className="col-span-2 w-full justify-center text-primary sm:w-auto">
                <ShoppingCart /> Apri ordine
              </Button>
            ) : quotation.status === "attivo" ? (
              <Button onClick={() => router.push(`/orders/new?fromQuotationId=${quotation.id}`)} className="col-span-2 w-full justify-center sm:w-auto">
                <ShoppingCart /> Trasforma in ordine
              </Button>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-24 lg:h-dvh lg:max-w-[1200px] lg:gap-6 lg:px-10 lg:pb-0">
        {/* Titolo, schede e ricerca restano visibili: sticky su mobile, fissi su desktop (scorrono elenco e dettaglio) */}
        <div className="sticky top-[var(--app-header-h)] z-20 -mx-4 border-b border-border/70 bg-background px-4 pt-5 pb-3 lg:static lg:mx-0 lg:border-0 lg:px-0 lg:pt-8 lg:pb-0">
          <PageHeader
            className="gap-3"
            eyebrow="Offerte ai clienti"
            title="Preventivi"
            actions={
              <>
                <SegmentedTabs
                  className="order-2 sm:w-72 lg:order-1"
                  value={activeTab}
                  onChange={setActiveTab}
                  options={[
                    { value: "attivi", label: "Attivi", count: quotationCounts.attivi },
                    { value: "convertiti", label: "Trasformati", count: quotationCounts.convertiti },
                  ]}
                />
                <SearchField
                  className="order-1 sm:flex-1 lg:order-2 lg:w-[360px] lg:flex-none"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Numero, cliente, agente"
                  ariaLabel="Cerca preventivi"
                />
              </>
            }
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
                {searchQuery.trim()
                  ? "Prova a modificare i criteri di ricerca"
                  : activeTab === "convertiti"
                    ? "I preventivi trasformati in ordine appariranno qui"
                    : "I preventivi attivi appariranno qui"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
            <section aria-label="Elenco preventivi" className="flex min-w-0 flex-col gap-2.5 lg:-mx-1.5 lg:overflow-y-auto lg:px-1.5 lg:pt-1.5 lg:pb-8">
              {filteredQuotations.map((quotation) => {
                const isOpen = expanded === quotation.id;
                const totalQty = calculateOrderTotalPieces(quotation.items);
                const articleCount = countArticleLines(quotation.items);
                return (
                  <article
                    key={quotation.id}
                    className={cn(
                      "shrink-0 overflow-hidden rounded-xl border bg-card shadow-card transition-[border-color,box-shadow]",
                      isOpen ? "border-primary ring-4 ring-primary/10" : "border-border/80"
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
                      onClick={() => {
                        setExpanded(isOpen ? null : quotation.id);
                        setDeleteConfirm(null);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{quotation.numero} · {formatDate(quotation.dataPreventivo)}</p>
                          <p className="mt-0.5 text-base leading-snug font-bold text-foreground">{quotation.cliente}</p>
                          {quotation.luogoConsegna && (
                            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{quotation.luogoConsegna}</span>
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-base font-bold whitespace-nowrap tabular-nums text-foreground">{formatCurrency(quotationTotal(quotation))}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderStatusChip(quotation)}
                        {isAdmin && <span className="text-xs text-muted-foreground">{quotation.agenteFullName || quotation.agente}</span>}
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
                        <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform lg:hidden", isOpen && "rotate-180")} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border lg:hidden">
                        {renderQuotationDetail(quotation, "px-4")}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            <section
              aria-label="Dettaglio preventivo"
              className="hidden max-h-[calc(100%-2rem)] self-start overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-panel lg:mt-1.5 lg:block"
            >
              {selectedQuotation ? (
                <>
                  <div className="px-6 pt-6 pb-4">
                    <p className="font-mono text-[13px] text-muted-foreground">Preventivo {selectedQuotation.numero}</p>
                    <h2 className="mt-1 font-display text-[28px] leading-tight font-bold tracking-tight text-foreground">{selectedQuotation.cliente}</h2>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{renderStatusChip(selectedQuotation)}</div>
                  </div>
                  {renderQuotationDetail(selectedQuotation, "px-6")}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground">Seleziona un preventivo</p>
                  <p className="max-w-xs text-sm text-muted-foreground">Il dettaglio con righe, totali e azioni apparirà qui.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <Link
        href="/quotations/new"
        className="no-print fixed right-4 bottom-[calc(var(--app-tabbar-h)+0.75rem)] z-30 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary pr-5 pl-4 text-[15px] font-semibold text-primary-foreground shadow-primary transition-colors hover:bg-primary-hover lg:hidden"
      >
        <Plus className="h-5 w-5" />
        Nuovo preventivo
      </Link>
    </div>
  );
}
