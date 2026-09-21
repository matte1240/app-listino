"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Save,
  ShieldAlert,
  ShoppingCart,
  Truck,
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
import OrderLinesEditor from "@/components/OrderLinesEditor";
import SearchBar from "@/components/SearchBar";
import { countArticleLines, itemsRequireApproval } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, calculateOrderTotalPieces, formatOrderCurrency } from "@/lib/order-totals";
import { useAuth } from "@/lib/auth-context";
import { useQuotationStore } from "@/lib/useQuotationStore";
import { VALIDITA_PREVENTIVO_GIORNI, type AnagraficaSearchItem, type Quotation } from "@/types";

const STEP_LABELS = ["Cliente", "Materiali", "Dati", "Riepilogo"] as const;

interface Props {
  editingQuotation?: Quotation;
}

const formatCurrency = formatOrderCurrency;

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function addDays(iso: string, days: number) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function QuotationWizard({ editingQuotation }: Props) {
  const router = useRouter();
  const materials = useQuotationStore((s) => s.materials);
  const lines = useQuotationStore((s) => s.lines);
  const quotationInfo = useQuotationStore((s) => s.quotationInfo);
  const currentStep = useQuotationStore((s) => s.currentStep);
  const setStep = useQuotationStore((s) => s.setStep);
  const setQuotationInfo = useQuotationStore((s) => s.setQuotationInfo);
  const setLines = useQuotationStore((s) => s.setLines);
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
  const [savedPendingApproval, setSavedPendingApproval] = useState(false);
  const [openArticleRequest, setOpenArticleRequest] = useState<{ codice: string; requestId: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const openArticleRequestIdRef = useRef(0);

  const isEditing = !!editingQuotation;
  const { user } = useAuth();

  useEffect(() => {
    if (!editingQuotation) return;

    setQuotationInfo({
      clienteId: editingQuotation.clienteId,
      cliente: editingQuotation.cliente,
      dataPreventivo: editingQuotation.dataPreventivo,
      dataConsegnaPrevista: editingQuotation.dataConsegnaPrevista || editingQuotation.dataPreventivo || today(),
      validitaGiorni: editingQuotation.validitaGiorni ?? 30,
      note: editingQuotation.note,
    });

    setLines(editingQuotation.items);

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

  const flaggedCount = countArticleLines(lines);
  const totalQty = calculateOrderTotalPieces(lines);
  const quotationRows = lines;
  const total = calculateOrderDiscountedTotal(lines);
  /** Sconti liberi presenti: il preventivo resterà in attesa di un amministratore (gli admin approvano implicitamente). */
  const requiresApproval = itemsRequireApproval(lines) && user?.role !== "admin";

  const canGoNextStep1 = quotationInfo.cliente.trim() !== "";
  const canGoNextStep2 = flaggedCount > 0;
  const canGoNextStep3 = quotationInfo.dataPreventivo.trim() !== "";
  const validitaGiorni = quotationInfo.validitaGiorni ?? 30;
  const dataConsegnaPrevista = quotationInfo.dataConsegnaPrevista ?? "";
  const dataScadenza = addDays(quotationInfo.dataPreventivo, validitaGiorni);

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

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      const res = await fetch(isEditing && editingQuotation ? `/api/quotations/${editingQuotation.id}` : "/api/quotations", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...quotationInfo, items: quotationRows }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Errore salvataggio");

      const id = data?.quotation?.id ?? data?.id ?? editingQuotation?.id;
      const pending = data?.quotation?.status === "in_approvazione";
      setSavedPendingApproval(pending);
      setSaved(true);
      resetQuotation();
      setTimeout(() => router.push(id ? `/quotations/${id}` : "/quotations"), pending ? 1600 : 900);
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : "Errore nel salvataggio del preventivo");
    } finally {
      setSaving(false);
    }
  }, [editingQuotation, isEditing, quotationInfo, quotationRows, resetQuotation, router, saving]);

  /** Uno step è raggiungibile dallo stepper se tutti i precedenti sono completi (in modifica lo sono tutti). */
  const canReachStep = (step: 1 | 2 | 3 | 4): boolean => {
    if (step === 1) return true;
    if (step === 2) return canGoNextStep1;
    if (step === 3) return canGoNextStep1 && canGoNextStep2;
    return canGoNextStep1 && canGoNextStep2 && canGoNextStep3;
  };

  const goToStep = (step: 1 | 2 | 3 | 4) => {
    if (step === currentStep || !canReachStep(step)) return;
    setMobileCartOpen(false);
    setStep(step);
  };

  const Stepper = () => (
    <div className="flex items-center gap-0 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
        const isActive = currentStep === stepNum;
        const isDone = currentStep > stepNum;
        const reachable = canReachStep(stepNum);
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => goToStep(stepNum)}
              disabled={!reachable}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Vai allo step ${stepNum}: ${label}`}
              className={`group flex flex-col items-center gap-1 shrink-0 rounded-lg px-1 -mx-1 transition-colors ${
                reachable && !isActive ? "cursor-pointer hover:bg-primary/5" : "cursor-default"
              }`}
            >
              <div className={`flex h-7 w-7 rounded-full items-center justify-center text-xs font-bold transition-all ${
                isDone || isActive ? "bg-primary text-primary-foreground" : reachable ? "bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary" : "bg-muted text-muted-foreground"
              } ${isActive ? "ring-4 ring-primary/20" : isDone ? "group-hover:ring-4 group-hover:ring-primary/20" : ""}`}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </span>
            </button>
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

      <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Righe preventivo</p>
        <OrderLinesEditor
          store="quotation"
          mode="cart"
          onEditArticle={handleEditItemInCatalog}
          listHeightClass={itemsHeightClass}
        />
      </div>
    </>
  );

  if (saved) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{savedPendingApproval ? "Preventivo inviato per approvazione" : "Preventivo salvato"}</h2>
        <p className="text-sm text-muted-foreground">
          {savedPendingApproval ? "Un amministratore deve approvare gli sconti liberi prima che sia utilizzabile. Apro il dettaglio..." : "Apro il dettaglio..."}
        </p>
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
            {renderCartSummary("max-h-[46dvh]")}
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

        <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <DrawerContent className="lg:hidden p-0 rounded-t-2xl">
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
            <div className="min-h-0 flex-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-3 overflow-y-auto">
              {renderCartSummary("max-h-[50dvh]")}
            </div>
          </DrawerContent>
        </Drawer>

        <div className="lg:hidden sticky bottom-0 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            aria-label={`Apri carrello, ${flaggedCount} articoli`}
            className="flex-1 min-w-0 h-10 rounded-xl border border-border bg-card px-2 flex items-center justify-center gap-2 text-sm hover:border-primary/40 active:bg-muted transition-colors"
          >
            <ShoppingCart className="h-4 w-4 text-primary shrink-0" />
            <span className="flex flex-col items-start leading-tight min-w-0">
              <span className="font-semibold truncate">
                {flaggedCount} <span className="font-normal text-muted-foreground">articoli</span>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums truncate">{formatCurrency(total)}</span>
            </span>
          </button>
          <Button size="sm" className="gap-1.5 font-semibold" disabled={!canGoNextStep2} onClick={() => { setMobileCartOpen(false); setStep(3); }}>
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
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Data preventivo
            </Label>
            <div className="h-11 rounded-xl border border-border bg-muted/40 px-3 flex items-center text-sm font-semibold text-foreground">
              {formatDate(quotationInfo.dataPreventivo)}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataConsegnaPrevista" className="text-sm font-medium flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              Data consegna prevista
            </Label>
            <Input
              id="dataConsegnaPrevista"
              type="date"
              min={quotationInfo.dataPreventivo}
              value={dataConsegnaPrevista}
              onChange={(event) => setQuotationInfo({ dataConsegnaPrevista: event.target.value })}
              className="h-11 rounded-xl text-base bg-background"
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Validità preventivo
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {VALIDITA_PREVENTIVO_GIORNI.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setQuotationInfo({ validitaGiorni: days })}
                  className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
                    validitaGiorni === days
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {days} giorni
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Scade il {formatDate(dataScadenza)}</p>
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data preventivo</p>
              <p className="font-semibold">{formatDate(quotationInfo.dataPreventivo)}</p>
            </div>
          </div>
          {dataConsegnaPrevista && (
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Consegna prevista</p>
                <p className="font-semibold">{formatDate(dataConsegnaPrevista)}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Validità</p>
              <p className="font-semibold">{validitaGiorni} giorni · scade il {formatDate(dataScadenza)}</p>
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
            <span className="text-[11px] text-muted-foreground hidden sm:inline">trascina per riordinare</span>
            <Badge className="ml-auto rounded-full px-2.5 text-xs">{flaggedCount}</Badge>
          </div>
          <div className="px-3 py-3">
            <OrderLinesEditor
              store="quotation"
              mode="summary"
              onEditArticle={handleEditItemInCatalog}
              showTrasportoControl
            />
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between text-sm">
            <span className="font-semibold">Totale imponibile</span>
            <span className="font-bold text-base">{formatCurrency(total)}</span>
          </div>
        </div>

        {requiresApproval && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Questo preventivo contiene <strong>sconti liberi</strong> (diversi da 0, 8% e 15%): verrà inviato a un amministratore per
              approvazione. PDF e trasformazione in ordine saranno disponibili dopo il suo via libera.
            </span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="outline" className="w-full h-11 gap-2 sm:flex-1" onClick={() => setStep(3)} disabled={saving}>
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <Button className="w-full h-11 gap-2 font-semibold sm:flex-1" onClick={handleSave} disabled={saving || !canGoNextStep1 || !canGoNextStep2 || !canGoNextStep3}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvataggio..." : requiresApproval ? "Salva e invia per approvazione" : isEditing ? "Salva modifiche" : "Salva preventivo"}
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