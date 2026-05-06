"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Save,
  ShoppingCart,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MaterialList from "@/components/MaterialList";
import SearchBar from "@/components/SearchBar";
import { useQuotationStore } from "@/lib/useQuotationStore";
import type { AnagraficaSearchItem, Quotation, QuotationItem } from "@/types";

const STEP_LABELS = ["Cliente", "Materiali", "Dati", "Riepilogo"] as const;

interface Props {
  editingQuotation?: Quotation;
}

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function discountedPrice(item: QuotationItem) {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

export default function QuotationWizard({ editingQuotation }: Props) {
  const router = useRouter();
  const materials = useQuotationStore((s) => s.materials);
  const quotationItems = useQuotationStore((s) => s.quotationItems);
  const quotationInfo = useQuotationStore((s) => s.quotationInfo);
  const currentStep = useQuotationStore((s) => s.currentStep);
  const setStep = useQuotationStore((s) => s.setStep);
  const setQuotationInfo = useQuotationStore((s) => s.setQuotationInfo);
  const toggleFlag = useQuotationStore((s) => s.toggleFlag);
  const setQty = useQuotationStore((s) => s.setQty);
  const setSconto = useQuotationStore((s) => s.setSconto);
  const resetQuotation = useQuotationStore((s) => s.resetQuotation);
  const setSearchQuery = useQuotationStore((s) => s.setSearchQuery);
  const setShowObsolete = useQuotationStore((s) => s.setShowObsolete);
  const mobileCartOpen = useQuotationStore((s) => s.mobileCartOpen);
  const setMobileCartOpen = useQuotationStore((s) => s.setMobileCartOpen);

  const [customerResults, setCustomerResults] = useState<AnagraficaSearchItem[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openArticleRequest, setOpenArticleRequest] = useState<{ codice: string; requestId: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const openArticleRequestIdRef = useRef(0);

  const isEditing = !!editingQuotation;

  useEffect(() => {
    if (!editingQuotation) return;

    setQuotationInfo({
      clienteId: editingQuotation.clienteId,
      cliente: editingQuotation.cliente,
      dataPreventivo: editingQuotation.dataPreventivo,
      note: editingQuotation.note,
    });

    for (const item of editingQuotation.items) {
      const current = useQuotationStore.getState().quotationItems[item.codice];
      if (!current?.flagged) toggleFlag(item.codice);
      if ((current?.qty ?? 0) !== item.qty) setQty(item.codice, item.qty);
      const normalizedSconto: 0 | 8 | 15 = item.sconto === 8 || item.sconto === 15 ? item.sconto : 0;
      if ((current?.sconto ?? 0) !== normalizedSconto) setSconto(item.codice, normalizedSconto);
    }

    setStep(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingQuotation]);

  useEffect(() => {
    const q = quotationInfo.cliente.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      setCustomerLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await fetch(`/api/anagrafiche?q=${encodeURIComponent(q)}&limit=8`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setCustomerResults([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setCustomerResults(Array.isArray(data?.anagrafiche) ? data.anagrafiche : []);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [quotationInfo.cliente]);

  useEffect(() => {
    if (currentStep !== 2 && mobileCartOpen) setMobileCartOpen(false);
  }, [currentStep, mobileCartOpen, setMobileCartOpen]);

  const flaggedItems = materials.filter((material) => quotationItems[material.codice]?.flagged);
  const flaggedCount = flaggedItems.length;
  const totalQty = flaggedItems.reduce((sum, material) => sum + (quotationItems[material.codice]?.qty ?? 0), 0);
  const quotationRows = flaggedItems.map((material) => ({
    codice: material.codice,
    descrizione: material.descrizioneAI || material.descrizione,
    qty: quotationItems[material.codice]?.qty ?? 0,
    um: material.um,
    prezzoListino: material.prezzoListino,
    sconto: quotationItems[material.codice]?.sconto ?? 0,
  })) satisfies QuotationItem[];
  const total = quotationRows.reduce((sum, item) => sum + discountedPrice(item) * item.qty, 0);

  const canGoNextStep1 = quotationInfo.cliente.trim() !== "";
  const canGoNextStep2 = flaggedCount > 0;
  const canGoNextStep3 = quotationInfo.dataPreventivo.trim() !== "";

  function handleSelectCustomer(customer: AnagraficaSearchItem) {
    setQuotationInfo({ clienteId: customer.id, cliente: customer.ragioneSociale });
    setCustomerDropdownOpen(false);
  }

  const handleArticleConfirmed = useCallback(() => {
    setSearchQuery("");
    const focusSearch = () => searchInputRef.current?.focus({ preventScroll: true });
    focusSearch();
    window.requestAnimationFrame(focusSearch);
    window.setTimeout(focusSearch, 120);
  }, [setSearchQuery]);

  const handleEditItemInCatalog = useCallback((codice: string) => {
    setMobileCartOpen(false);
    const targetMaterial = materials.find((material) => material.codice === codice);
    if (targetMaterial?.obsoleto) setShowObsolete(true);

    setSearchQuery(codice);
    openArticleRequestIdRef.current += 1;
    setOpenArticleRequest({ codice, requestId: openArticleRequestIdRef.current });
    setStep(2);
  }, [materials, setMobileCartOpen, setSearchQuery, setShowObsolete, setStep]);

  const handleOpenArticleRequestHandled = useCallback((requestId: number) => {
    setOpenArticleRequest((current) => {
      if (!current || current.requestId !== requestId) return current;
      return null;
    });
  }, []);

  const handleRemoveItemFromCart = useCallback((codice: string, articoloLabel?: string) => {
    const message = articoloLabel
      ? `Vuoi rimuovere "${articoloLabel}" dal preventivo?`
      : `Vuoi rimuovere l'articolo ${codice} dal preventivo?`;

    if (!window.confirm(message)) return;
    setQty(codice, 0);
    setSconto(codice, 0);
  }, [setQty, setSconto]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      const res = await fetch(isEditing && editingQuotation ? `/api/quotations/${editingQuotation.id}` : "/api/quotations", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...quotationInfo, items: quotationRows }),
      });

      if (!res.ok) throw new Error("Errore salvataggio");

      const data = await res.json();
      const id = data?.quotation?.id ?? data?.id ?? editingQuotation?.id;
      setSaved(true);
      resetQuotation();
      setTimeout(() => router.push(id ? `/quotations/${id}` : "/quotations"), 900);
    } catch {
      alert("Errore nel salvataggio del preventivo");
    } finally {
      setSaving(false);
    }
  }, [editingQuotation, isEditing, quotationInfo, quotationRows, resetQuotation, router, saving]);

  const Stepper = () => (
    <div className="flex items-center gap-0 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
        const isActive = currentStep === stepNum;
        const isDone = currentStep > stepNum;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`flex h-7 w-7 rounded-full items-center justify-center text-xs font-bold transition-all ${
                isDone || isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              } ${isActive ? "ring-4 ring-primary/20" : ""}`}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && <div className={`flex-1 h-px mx-2 mt-[-10px] ${isDone ? "bg-primary/40" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );

  const renderCartSummary = (itemsHeightClass: string) => (
    <>
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Cliente</p>
            <p className="text-sm font-semibold truncate">{quotationInfo.cliente || "Non selezionato"}</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          <strong className="text-foreground">{flaggedCount}</strong> articoli · <strong className="text-foreground">{totalQty}</strong> pezzi
        </div>
        <div className="text-xs text-muted-foreground">
          Totale: <strong className="text-foreground">{formatCurrency(total)}</strong>
        </div>
      </div>

      {flaggedCount > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Articoli inseriti</p>
          <div className={`flex flex-col gap-2 ${itemsHeightClass} overflow-y-auto pr-1`}>
            {quotationRows.map((item) => (
              <div key={item.codice} className="rounded-xl border border-border/70 bg-background px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold font-mono truncate">{item.codice}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{item.descrizione}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-foreground">{item.qty} {item.um}</span>
                      {(item.sconto ?? 0) > 0 && <span className="font-semibold text-primary">-{item.sconto}%</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditItemInCatalog(item.codice)}
                      className="h-7 px-2 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      aria-label={`Rimuovi ${item.codice} dal preventivo`}
                      onClick={() => handleRemoveItemFromCart(item.codice, item.descrizione)}
                      className="h-7 w-7 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (saved) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Preventivo salvato</h2>
        <p className="text-sm text-muted-foreground">Apro il dettaglio...</p>
      </div>
    );
  }

  if (currentStep === 1) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
        <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground mb-0.5">Cliente preventivo</h2>
            <p className="text-sm text-muted-foreground">Cerca nelle anagrafiche o inserisci il nome manualmente.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cliente" className="text-sm font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Cliente <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="cliente"
                placeholder="Nome azienda o cliente"
                value={quotationInfo.cliente}
                autoFocus
                onFocus={() => setCustomerDropdownOpen(true)}
                onBlur={() => { setTimeout(() => setCustomerDropdownOpen(false), 120); }}
                onChange={(event) => {
                  setQuotationInfo({ cliente: event.target.value, clienteId: null });
                  setCustomerDropdownOpen(true);
                }}
                className="h-11 rounded-xl text-base bg-background"
                style={{ fontSize: "16px" }}
                autoComplete="organization"
              />
              {customerDropdownOpen && quotationInfo.cliente.trim().length >= 2 && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                  {customerLoading && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Ricerca clienti...
                    </div>
                  )}
                  {!customerLoading && customerResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Nessuna anagrafica trovata. Puoi inserire il cliente manualmente.</div>
                  )}
                  {!customerLoading && customerResults.length > 0 && (
                    <div className="max-h-56 overflow-y-auto">
                      {customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelectCustomer(customer)}
                          className={`w-full text-left px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-muted/50 transition-colors ${customer.id === quotationInfo.clienteId ? "bg-primary/10" : ""}`}
                        >
                          <p className="text-sm font-medium truncate">{customer.ragioneSociale}</p>
                          <p className="text-xs text-muted-foreground truncate">{customer.codice}{customer.partitaIva ? ` · P.IVA ${customer.partitaIva}` : ""}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {quotationInfo.clienteId ? (
              <p className="text-[11px] text-primary">Cliente selezionato da anagrafica</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Puoi anche inserire un cliente non presente in anagrafica</p>
            )}
          </div>

          <Button className="mt-2 h-11 gap-2 font-semibold" disabled={!canGoNextStep1} onClick={() => setStep(2)}>
            Avanti
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (currentStep === 2) {
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 sm:gap-3">
            <div className="flex-1">
              <SearchBar ref={searchInputRef} autoFocus store="quotation" />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row max-w-5xl mx-auto w-full">
          <main className="flex-1 min-w-0 px-4 py-5">
            <Stepper />
            <MaterialList
              store="quotation"
              onArticleConfirmed={handleArticleConfirmed}
              openArticleRequest={openArticleRequest}
              onOpenArticleRequestHandled={handleOpenArticleRequestHandled}
            />
          </main>

          <aside className="hidden lg:flex w-72 shrink-0 flex-col gap-3 px-4 py-5 border-l border-border sticky top-[calc(3.5rem+49px)] self-start max-h-[calc(100dvh-3.5rem-49px)] overflow-y-auto">
            {renderCartSummary("max-h-64")}
            <Button variant="outline" className="gap-2 text-sm" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button className="gap-2 text-sm font-semibold" disabled={!canGoNextStep2} onClick={() => setStep(3)}>
              Avanti
              <ChevronRight className="h-4 w-4" />
              {flaggedCount > 0 && <Badge className="ml-1 rounded-full px-2 py-0 h-5 text-xs">{flaggedCount}</Badge>}
            </Button>
          </aside>
        </div>

        <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen} direction="right">
          <DrawerContent className="lg:hidden w-[88%] p-0">
            <DrawerHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Articoli preventivo
                </DrawerTitle>
                <DrawerClose asChild>
                  <button type="button" className="h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center" aria-label="Chiudi carrello">
                    <X className="h-4 w-4" />
                  </button>
                </DrawerClose>
              </div>
            </DrawerHeader>
            <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto">
              {renderCartSummary("max-h-[52dvh]")}
            </div>
          </DrawerContent>
        </Drawer>

        <div className="lg:hidden sticky bottom-0 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <div className="flex-1 text-center text-sm">
            <span className="font-semibold">{flaggedCount}</span>
            <span className="text-muted-foreground"> articoli</span>
          </div>
          <Button size="sm" className="gap-1.5 font-semibold" disabled={!canGoNextStep2} onClick={() => setStep(3)}>
            Avanti
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (currentStep === 3) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
        <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground mb-0.5">Dati preventivo</h2>
            <p className="text-sm text-muted-foreground">Preventivo per <strong>{quotationInfo.cliente}</strong> · {flaggedCount} articoli selezionati</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataPreventivo" className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Data preventivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dataPreventivo"
              type="date"
              value={quotationInfo.dataPreventivo}
              onChange={(event) => setQuotationInfo({ dataPreventivo: event.target.value })}
              className="h-11 rounded-xl text-base bg-background"
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note" className="text-sm font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              Note
            </Label>
            <Textarea
              id="note"
              placeholder="Note da mostrare nel preventivo"
              value={quotationInfo.note}
              onChange={(event) => setQuotationInfo({ note: event.target.value })}
              className="rounded-xl text-base bg-background resize-none"
              rows={4}
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 mt-2 sm:flex-row">
            <Button variant="outline" className="w-full h-11 gap-2 sm:flex-1" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button className="w-full h-11 gap-2 font-semibold sm:flex-1" disabled={!canGoNextStep3} onClick={() => setStep(4)}>
              Riepilogo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
      <Stepper />
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-0.5">Riepilogo preventivo</h2>
          <p className="text-sm text-muted-foreground">Controlla i dati prima di salvare.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="font-semibold">{quotationInfo.cliente}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data</p>
              <p className="font-semibold">{new Date(`${quotationInfo.dataPreventivo}T00:00:00`).toLocaleDateString("it-IT")}</p>
            </div>
          </div>
          {quotationInfo.note && (
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Note</p>
                <p className="font-medium text-foreground/80 whitespace-pre-wrap">{quotationInfo.note}</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Articoli</span>
            <Badge className="ml-auto rounded-full px-2.5 text-xs">{flaggedCount}</Badge>
          </div>
          <div className="divide-y divide-border/60">
            {quotationRows.map((item) => {
              const rowTotal = discountedPrice(item) * item.qty;
              return (
                <div key={item.codice} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold font-mono text-foreground">{item.codice}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{item.descrizione}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:shrink-0 sm:justify-end">
                    <span className="font-bold text-foreground">{item.qty}</span>
                    <span className="text-muted-foreground">{item.um}</span>
                    {(item.sconto ?? 0) > 0 && <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{item.sconto}%</span>}
                    <span className="font-semibold text-foreground">{formatCurrency(rowTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between text-sm">
            <span className="font-semibold">Totale imponibile</span>
            <span className="font-bold text-base">{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="outline" className="w-full h-11 gap-2 sm:flex-1" onClick={() => setStep(3)} disabled={saving}>
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <Button className="w-full h-11 gap-2 font-semibold sm:flex-1" onClick={handleSave} disabled={saving || !canGoNextStep1 || !canGoNextStep2 || !canGoNextStep3}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Salva preventivo"}
          </Button>
        </div>

        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => router.push("/quotations")} disabled={saving}>
          <FileText className="h-4 w-4" />
          Torna ai preventivi
        </Button>
      </div>
    </div>
  );
}