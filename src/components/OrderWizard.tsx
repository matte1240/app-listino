"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  User, Warehouse, MapPin, Calendar, MessageSquare,
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
  Package, Send, Save, ShoppingCart, X, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import SearchBar from "@/components/SearchBar";
import MaterialList from "@/components/MaterialList";
import OrderLinesEditor from "@/components/OrderLinesEditor";
import QuickLineComposer, { type LineComposerRequest, type QuickLineComposerHandle } from "@/components/QuickLineComposer";
import AddressAutocompleteInput, {
  type AddressAutocompleteInputHandle,
  type AddressData,
} from "@/components/AddressAutocompleteInput";
import { countArticleLines, itemsRequireApproval, linesCoveredByQuotation } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, calculateOrderTotalPieces, formatOrderCurrency } from "@/lib/order-totals";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import { MAGAZZINI, type AnagraficaSearchItem, type OrderHistoryItem } from "@/types";
import type { Order, OrderLine } from "@/types";
import ExitOrderDialog from "@/components/ExitOrderDialog";

const STEP_LABELS = ["Cliente", "Materiali", "Dettagli", "Riepilogo"] as const;

interface Props {
  /** When provided, we're editing this order */
  editingOrder?: Order;
}

export default function OrderWizard({ editingOrder }: Props) {
  const router = useRouter();

  const materials = useOrderStore((s) => s.materials);
  const lines = useOrderStore((s) => s.lines);
  const sourceQuotationItems = useOrderStore((s) => s.sourceQuotationItems);
  const orderInfo = useOrderStore((s) => s.orderInfo);
  const currentStep = useOrderStore((s) => s.currentStep);
  const setStep = useOrderStore((s) => s.setStep);
  const setOrderInfo = useOrderStore((s) => s.setOrderInfo);
  const setLines = useOrderStore((s) => s.setLines);
  const resetOrder = useOrderStore((s) => s.resetOrder);
  const setSearchQuery = useOrderStore((s) => s.setSearchQuery);
  const setShowObsolete = useOrderStore((s) => s.setShowObsolete);
  const mobileCartOpen = useOrderStore((s) => s.mobileCartOpen);
  const setMobileCartOpen = useOrderStore((s) => s.setMobileCartOpen);

  const exitDialogOpen = useOrderStore((s) => s.exitDialogOpen);
  const setExitDialogOpen = useOrderStore((s) => s.setExitDialogOpen);

  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState("Ordine salvato!");

  // Address state
  const addressInputRef = useRef<AddressAutocompleteInputHandle>(null);
  const addressDataRef = useRef<AddressData | null>(null);
  const [isAddressValid, setIsAddressValid] = useState(true);

  // Customer search
  const [customerResults, setCustomerResults] = useState<AnagraficaSearchItem[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<string[]>([]);
  const [recentDestinationsLoading, setRecentDestinationsLoading] = useState(false);
  const [selectedRecentDestination, setSelectedRecentDestination] = useState("");
  const [openArticleRequest, setOpenArticleRequest] = useState<{ codice: string; requestId: number } | null>(null);
  const openArticleRequestIdRef = useRef(0);
  // Casella righe manuali/note (sticky sotto la ricerca): la richiesta di apertura resta in attesa finché lo step 2 non è montato.
  const composerRef = useRef<QuickLineComposerHandle>(null);
  const pendingLineRequestRef = useRef<{ request: LineComposerRequest; fromOtherStep: boolean } | null>(null);
  const [lineRequestTick, setLineRequestTick] = useState(0);
  // Altezza dell'header sticky (ricerca + casella): la sidebar desktop si aggancia subito sotto.
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const step2RootRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const isEditing = !!editingOrder;
  const editingSource = editingOrder?.draft ?? editingOrder;
  /** Ordine mai inviato al magazzino (bozza o in attesa di approvazione): si salva/invia come nuovo, non come modifica. */
  const isStandaloneDraft =
    (editingOrder?.status === "bozza" || editingOrder?.status === "in_approvazione") && editingOrder.parentOrderId === null;
  const isModificationEditing = !!editingOrder && !isStandaloneDraft;
  const hasOpenModificationDraft = !!editingOrder?.draft;

  // On mount: if editing, populate store with order data
  useEffect(() => {
    if (!editingSource) return;
    const initialNote = editingOrder?.draft?.note?.trim()
      ? editingOrder.draft.note
      : editingOrder?.note ?? editingSource.note;

    // Populate orderInfo
    setOrderInfo({
      quotationId: editingOrder?.quotationId ?? null,
      clienteId: editingSource.clienteId ?? null,
      cliente: editingSource.cliente,
      magazzino: editingSource.magazzino as typeof orderInfo.magazzino,
      luogoConsegna: editingSource.luogoConsegna,
      dataConsegna: editingSource.dataConsegna,
      note: initialNote,
    });
    // Populate lines from order (ordine, tipi e id preservati)
    setLines(editingSource.items);
    // Start at step 1 when editing so user can review customer selection first
    setStep(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSource]);

  // Customer autocomplete
  useEffect(() => {
    const q = orderInfo.cliente.trim();
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
        if (!res.ok) { if (!cancelled) setCustomerResults([]); return; }
        const data = await res.json();
        if (!cancelled) setCustomerResults(Array.isArray(data?.anagrafiche) ? data.anagrafiche : []);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [orderInfo.cliente]);

  // Load recent destinations for selected customer
  useEffect(() => {
    if (!orderInfo.clienteId) {
      setRecentDestinations([]);
      setRecentDestinationsLoading(false);
      setSelectedRecentDestination("");
      return;
    }

    let cancelled = false;
    setRecentDestinationsLoading(true);

    fetch(`/api/anagrafiche/${orderInfo.clienteId}/recent-destinations?limit=8`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.destinations) ? data.destinations : [];
      })
      .then((destinations: string[]) => {
        if (!cancelled) {
          setRecentDestinations(destinations);
        }
      })
      .catch(() => {
        if (!cancelled) setRecentDestinations([]);
      })
      .finally(() => {
        if (!cancelled) setRecentDestinationsLoading(false);
      });

    return () => { cancelled = true; };
  }, [orderInfo.clienteId]);

  function handleSelectCustomer(customer: AnagraficaSearchItem) {
    setOrderInfo({
      clienteId: customer.id,
      cliente: customer.ragioneSociale,
    });
    setSelectedRecentDestination("");
    setCustomerDropdownOpen(false);
  }

  const handleDeliveryAddressChange = useCallback((value: string) => {
    setOrderInfo({ luogoConsegna: value });
    if (selectedRecentDestination && value !== selectedRecentDestination) {
      setSelectedRecentDestination("");
    }
  }, [selectedRecentDestination, setOrderInfo]);

  const handleAddressResolved = useCallback((data: AddressData) => {
    addressDataRef.current = data;
    if (data.address) {
      setOrderInfo({ luogoConsegna: data.address });
    }
  }, [setOrderInfo]);

  // Items derived from store
  const flaggedCount = countArticleLines(lines);
  const totalPz = calculateOrderTotalPieces(lines);
  /** Sconti liberi presenti: l'invio passerà da un amministratore (gli admin approvano implicitamente,
   *  e un ordine che ricalca un preventivo già approvato non richiede una seconda approvazione). */
  const coveredByQuotation = !!sourceQuotationItems && linesCoveredByQuotation(lines, sourceQuotationItems);
  const requiresApproval = itemsRequireApproval(lines) && user?.role !== "admin" && !coveredByQuotation;

  const canGoNextStep1 = orderInfo.cliente.trim() !== "";
  const canGoNextStep2 = flaggedCount > 0;
  const today = new Date().toISOString().split("T")[0];

  const handleArticleConfirmed = useCallback(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  useEffect(() => {
    if (currentStep !== 2 && mobileCartOpen) {
      setMobileCartOpen(false);
    }
  }, [currentStep, mobileCartOpen, setMobileCartOpen]);

  const handleEditItemInCatalog = useCallback((codice: string) => {
    setMobileCartOpen(false);

    const targetMaterial = materials.find((m) => m.codice === codice);
    if (targetMaterial?.obsoleto) {
      setShowObsolete(true);
    }

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

  /** Righe manuali e note si modificano dalla casella sotto la barra di ricerca (step Materiali), come gli articoli. */
  const openLineComposer = useCallback((request: LineComposerRequest) => {
    pendingLineRequestRef.current = { request, fromOtherStep: currentStep !== 2 };
    setMobileCartOpen(false);
    setSearchQuery("");
    setStep(2);
    setLineRequestTick((tick) => tick + 1);
  }, [currentStep, setMobileCartOpen, setSearchQuery, setStep]);

  useEffect(() => {
    if (currentStep !== 2) return;
    const pending = pendingLineRequestRef.current;
    if (!pending) return;
    pendingLineRequestRef.current = null;
    // Arrivando da un altro step la pagina può essere scorsa: si riparte dall'alto (la casella è comunque sticky).
    if (pending.fromOtherStep) window.scrollTo({ top: 0 });
    composerRef.current?.open(pending.request);
  }, [currentStep, lineRequestTick]);

  const handleCreateManualFromSearch = useCallback((descrizione: string) => {
    composerRef.current?.open({ kind: "manuale", descrizione });
  }, []);

  // L'header sticky cambia altezza (casella aperta/chiusa): la si espone come variabile CSS per la sidebar.
  useEffect(() => {
    const header = stickyHeaderRef.current;
    const root = step2RootRef.current;
    if (!header || !root) return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--step2-header-h", `${header.offsetHeight}px`);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, [currentStep]);

  const handleEditLine = useCallback((line: OrderLine) => {
    openLineComposer({ kind: line.tipo === "commento" ? "nota" : "manuale", line });
  }, [openLineComposer]);

  const handleAddNoteAbove = useCallback((beforeId: string) => {
    openLineComposer({ kind: "nota", beforeId });
  }, [openLineComposer]);

  // Le righe dello store sono già nel formato persistito (id, tipo, snapshot descrizione/prezzo).
  const buildOrderItems = useCallback((): OrderHistoryItem[] => lines, [lines]);

  const totalImponibile = calculateOrderDiscountedTotal(lines);

  const getRequestConfig = useCallback((status: "bozza" | "confermato") => {
    const items = buildOrderItems();

    if (!isEditing || !editingOrder) {
      return {
        url: "/api/orders",
        method: "POST" as const,
        body: { ...orderInfo, items, status },
      };
    }

    if (status === "bozza" && !isStandaloneDraft) {
      return {
        url: `/api/orders/${editingOrder.id}/draft`,
        method: "PUT" as const,
        body: { ...orderInfo, items },
      };
    }

    return {
      url: `/api/orders/${editingOrder.id}`,
      method: "PUT" as const,
      body: { ...orderInfo, items, status },
    };
  }, [buildOrderItems, editingOrder, isEditing, isStandaloneDraft, orderInfo]);

  const getSuccessMessage = useCallback((status: "bozza" | "confermato", pendingApproval: boolean) => {
    if (status === "bozza") return "Bozza salvata!";
    if (pendingApproval) return isModificationEditing ? "Modifica inviata per approvazione!" : "Ordine inviato per approvazione!";
    if (!isEditing) return "Ordine salvato!";
    if (isStandaloneDraft) return "Ordine inviato!";
    return "Modifica inviata!";
  }, [isEditing, isModificationEditing, isStandaloneDraft]);

  const renderCartSummary = (itemsHeightClass: string) => (
    <>
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 rounded-full bg-primary/10 items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Cliente</p>
            <p className="text-sm font-semibold truncate">{orderInfo.cliente}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            {flaggedCount > 0 ? (
              <><strong className="text-foreground">{flaggedCount}</strong> articoli selezionati</>
            ) : (
              "Nessun articolo selezionato"
            )}
          </span>
        </div>
        {flaggedCount > 0 && (
          <div className="text-xs text-muted-foreground">
            Totale: <strong className="text-foreground">{totalPz} pz</strong>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Righe ordine</p>
        <OrderLinesEditor
          store="order"
          mode="cart"
          onEditArticle={handleEditItemInCatalog}
          onEditLine={handleEditLine}
          onAddNoteAbove={handleAddNoteAbove}
          listHeightClass={itemsHeightClass}
        />
      </div>
    </>
  );

  const handleSaveDraftAndExit = useCallback(async () => {
    // If no meaningful data, just exit
    if (!orderInfo.cliente.trim() || flaggedCount === 0) {
      resetOrder();
      setExitDialogOpen(false);
      router.push("/orders");
      return;
    }
    setSavingDraft(true);
    try {
      const request = getRequestConfig("bozza");
      await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
    } catch {
      // Ignore errors on auto-save draft, just exit
    } finally {
      setSavingDraft(false);
      resetOrder();
      setExitDialogOpen(false);
      router.push("/orders");
    }
  }, [orderInfo, flaggedCount, getRequestConfig, resetOrder, router, setExitDialogOpen]);

  const handleSave = useCallback(async (status: "bozza" | "confermato") => {
    if (saving) return;
    setSaving(true);
    try {
      const request = getRequestConfig(status);

      const res = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Errore salvataggio");

      const resultStatus = data?.status ?? data?.order?.status;
      const pendingApproval = data?.pendingApproval === true || resultStatus === "in_approvazione";
      setSavedMessage(getSuccessMessage(status, pendingApproval));
      setSaved(true);
      resetOrder();
      setTimeout(() => {
        setSaved(false);
        router.push("/orders");
      }, pendingApproval ? 1800 : 1200);
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : "Errore nel salvataggio dell'ordine");
    } finally {
      setSaving(false);
    }
  }, [getRequestConfig, getSuccessMessage, resetOrder, router, saving]);

  // ────────────────────────────────────────────
  // Stepper header
  // ────────────────────────────────────────────
    const exitDialog = (
      <ExitOrderDialog
        open={exitDialogOpen}
        saving={savingDraft}
        onSaveDraft={handleSaveDraftAndExit}
        onExitWithoutSaving={() => { resetOrder(); setExitDialogOpen(false); router.push("/orders"); }}
        onContinue={() => setExitDialogOpen(false)}
      />
    );

  /** Uno step è raggiungibile dallo stepper se tutti i precedenti sono completi (in modifica lo sono tutti). */
  const canReachStep = (step: 1 | 2 | 3 | 4): boolean => {
    if (step === 1) return true;
    if (step === 2) return canGoNextStep1;
    return canGoNextStep1 && canGoNextStep2;
  };

  const goToStep = async (step: 1 | 2 | 3 | 4) => {
    if (step === currentStep || !canReachStep(step)) return;
    // Lasciando lo step Dettagli con un indirizzo digitato, stessa validazione del pulsante "Avanti — Riepilogo".
    if (currentStep === 3 && step > 3 && orderInfo.luogoConsegna.trim()) {
      const valid = isAddressValid || (await addressInputRef.current?.validateAddress()) === true;
      if (!valid) return;
    }
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
              onClick={() => void goToStep(stepNum)}
              disabled={!reachable}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Vai allo step ${stepNum}: ${label}`}
              className={`group flex flex-col items-center gap-1 shrink-0 rounded-lg px-1 -mx-1 transition-colors ${
                reachable && !isActive ? "cursor-pointer hover:bg-primary/5" : "cursor-default"
              }`}
            >
              <div
                className={`flex h-7 w-7 rounded-full items-center justify-center text-xs font-bold transition-all ${
                  isDone
                    ? "bg-primary text-primary-foreground group-hover:ring-4 group-hover:ring-primary/20"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : reachable
                    ? "bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </div>
              <span
                className={`text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap ${
                  isActive ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </button>
            {idx < STEP_LABELS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mt-[-10px] transition-colors ${isDone ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ────────────────────────────────────────────
  // Step 1 — Cliente
  // ────────────────────────────────────────────
  if (currentStep === 1) {
    return (
        <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
          {exitDialog}
          <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground mb-0.5">Seleziona cliente</h2>
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
                value={orderInfo.cliente}
                autoFocus
                onFocus={() => setCustomerDropdownOpen(true)}
                onBlur={() => { setTimeout(() => setCustomerDropdownOpen(false), 120); }}
                onChange={(e) => {
                  setOrderInfo({ cliente: e.target.value, clienteId: null });
                  setRecentDestinations([]);
                  setRecentDestinationsLoading(false);
                  setSelectedRecentDestination("");
                  setCustomerDropdownOpen(true);
                  if (!isEditing) {
                    setOrderInfo({ luogoConsegna: "" });
                  }
                }}
                className="h-11 rounded-xl text-base bg-background"
                style={{ fontSize: "16px" }}
                autoComplete="organization"
              />
              {customerDropdownOpen && orderInfo.cliente.trim().length >= 2 && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                  {customerLoading && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Ricerca clienti...
                    </div>
                  )}
                  {!customerLoading && customerResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Nessuna anagrafica trovata. Puoi inserire il cliente manualmente.
                    </div>
                  )}
                  {!customerLoading && customerResults.length > 0 && (
                    <div className="max-h-56 overflow-y-auto">
                      {customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectCustomer(customer)}
                          className={`w-full text-left px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-muted/50 transition-colors ${
                            customer.id === orderInfo.clienteId ? "bg-primary/10" : ""
                          }`}
                        >
                          <p className="text-sm font-medium truncate">{customer.ragioneSociale}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {customer.codice}{customer.partitaIva ? ` · P.IVA ${customer.partitaIva}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {orderInfo.clienteId ? (
              <p className="text-[11px] text-primary">✓ Cliente selezionato da anagrafica</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Cerca nelle anagrafiche o inserisci il nome manualmente</p>
            )}
          </div>

          <Button
            className="mt-2 h-11 gap-2 font-semibold"
            disabled={!canGoNextStep1}
            onClick={() => setStep(2)}
          >
            Avanti — Seleziona materiali
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 2 — Materiali (full page with sidebar)
  // ────────────────────────────────────────────
  if (currentStep === 2) {
    return (
      <div ref={step2RootRef} className="min-h-dvh flex flex-col" style={{ "--step2-header-h": "49px" } as CSSProperties}>
          {exitDialog}
        {/* Header sticky: ricerca + casella righe manuali/note, sempre visibili scorrendo la lista */}
        <div ref={stickyHeaderRef} className="sticky top-14 z-30 bg-background/90 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col gap-2">
            <SearchBar autoFocus />
            <div className="lg:mr-72">
              <QuickLineComposer ref={composerRef} store="order" onAdded={handleArticleConfirmed} />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row max-w-5xl mx-auto w-full">
          {/* Materials catalog */}
          <main className="flex-1 min-w-0 px-4 py-5">
            <Stepper />
            <MaterialList
              onArticleConfirmed={handleArticleConfirmed}
              openArticleRequest={openArticleRequest}
              onOpenArticleRequestHandled={handleOpenArticleRequestHandled}
              onCreateManualFromSearch={handleCreateManualFromSearch}
            />
          </main>

          {/* Sticky sidebar */}
          <aside
            className="hidden lg:flex w-72 shrink-0 flex-col gap-3 px-4 py-5 border-l border-border sticky self-start overflow-y-auto"
            style={{ top: "calc(3.5rem + var(--step2-header-h))", maxHeight: "calc(100dvh - 3.5rem - var(--step2-header-h))" }}
          >
            {renderCartSummary("max-h-[46dvh]")}

            <Button
              variant="outline"
              className="gap-2 text-sm"
              onClick={() => setStep(1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button
              className="gap-2 text-sm font-semibold"
              disabled={!canGoNextStep2}
              onClick={() => setStep(3)}
            >
              Avanti
              <ChevronRight className="h-4 w-4" />
              {flaggedCount > 0 && <Badge className="ml-1 rounded-full px-2 py-0 h-5 text-xs">{flaggedCount}</Badge>}
            </Button>
          </aside>
        </div>

        {/* Mobile cart drawer */}
        <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <DrawerContent className="lg:hidden p-0 rounded-t-2xl">
            <DrawerHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Carrello articoli
                </DrawerTitle>
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center"
                    aria-label="Chiudi carrello"
                  >
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

        {/* Mobile sticky bottom bar */}
        <div className="lg:hidden sticky bottom-0 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setMobileCartOpen(false);
              setStep(1);
            }}
          >
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
              <span className="text-[11px] text-muted-foreground tabular-nums truncate">{formatOrderCurrency(totalImponibile)}</span>
            </span>
          </button>
          <Button
            size="sm"
            className="gap-1.5 font-semibold"
            disabled={!canGoNextStep2}
            onClick={() => {
              setMobileCartOpen(false);
              setStep(3);
            }}
          >
            Avanti
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 3 — Dettagli
  // ────────────────────────────────────────────
  if (currentStep === 3) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
          {exitDialog}
        <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground mb-0.5">Dettagli ordine</h2>
            <p className="text-sm text-muted-foreground">
              Ordine per <strong>{orderInfo.cliente}</strong> · {flaggedCount} articoli selezionati
            </p>
          </div>

          {/* Magazzino */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="magazzino" className="text-sm font-medium flex items-center gap-1.5">
              <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
              Magazzino <span className="text-destructive">*</span>
            </Label>
            <select
              id="magazzino"
              value={orderInfo.magazzino}
              onChange={(e) => setOrderInfo({ magazzino: e.target.value as typeof orderInfo.magazzino })}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ fontSize: "16px" }}
            >
              <option value="">Seleziona magazzino…</option>
              {MAGAZZINI.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Luogo consegna */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="luogo" className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Luogo di consegna
            </Label>
            {/* Recent destinations dropdown */}
            <select
              value={selectedRecentDestination}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedRecentDestination(value);
                if (value) setOrderInfo({ luogoConsegna: value });
              }}
              disabled={!orderInfo.clienteId || recentDestinationsLoading || recentDestinations.length === 0}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <option value="">
                {recentDestinationsLoading
                  ? "Caricamento destinazioni recenti..."
                  : !orderInfo.clienteId
                    ? "Seleziona prima un cliente da anagrafica"
                    : recentDestinations.length === 0
                      ? "Nessuna destinazione recente disponibile"
                      : "Destinazioni recenti del cliente"}
              </option>
              {recentDestinations.map((destination) => (
                <option key={destination} value={destination}>
                  {destination}
                </option>
              ))}
            </select>
            {/* Manual input with Google Places autocomplete */}
            <AddressAutocompleteInput
              ref={addressInputRef}
              id="luogo"
              placeholder="Indirizzo di consegna (opzionale)"
              value={orderInfo.luogoConsegna}
              onChange={handleDeliveryAddressChange}
              onAddressResolved={handleAddressResolved}
              onValidityChange={(valid) => {
                setIsAddressValid(valid);
                if (!valid) addressDataRef.current = null;
              }}
              className="h-11 rounded-xl text-base bg-background"
              style={{ fontSize: "16px" }}
            />
          </div>

          {/* Data consegna */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="data" className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Data di consegna
            </Label>
            <Input
              id="data"
              type="date"
              min={today}
              value={orderInfo.dataConsegna}
              onChange={(e) => setOrderInfo({ dataConsegna: e.target.value })}
              className="h-11 rounded-xl text-base bg-background"
              style={{ fontSize: "16px" }}
            />
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note" className="text-sm font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              Note
            </Label>
            <Textarea
              id="note"
              placeholder="Istruzioni speciali, note di consegna…"
              value={orderInfo.note}
              onChange={(e) => setOrderInfo({ note: e.target.value })}
              className="rounded-xl text-base bg-background resize-none"
              rows={3}
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 mt-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full h-11 gap-2 sm:flex-1"
              onClick={() => setStep(2)}
            >
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button
              className="w-full h-11 gap-2 font-semibold sm:flex-1"
              onClick={async () => {
                // If address field has text, validate it before proceeding
                if (orderInfo.luogoConsegna.trim()) {
                  const valid = isAddressValid || (await addressInputRef.current?.validateAddress()) === true;
                  if (!valid) return;
                }
                setStep(4);
              }}
            >
              Avanti — Riepilogo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 4 — Riepilogo
  // ────────────────────────────────────────────
  if (saved) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 flex flex-col items-center gap-4 text-center">
          {exitDialog}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{savedMessage}</h2>
        <p className="text-sm text-muted-foreground">Reindirizzamento agli ordini…</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
        {exitDialog}
      <Stepper />
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-0.5">Riepilogo ordine</h2>
          <p className="text-sm text-muted-foreground">
            {isModificationEditing
              ? "Controlla i dati prima di salvare la bozza o inviare la modifica."
              : "Controlla i dati prima di salvare o inviare."}
          </p>
        </div>

        {/* Cliente + dettagli */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="font-semibold">{orderInfo.cliente}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Magazzino</p>
              <p className="font-semibold">{orderInfo.magazzino}</p>
            </div>
          </div>
          {orderInfo.luogoConsegna && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Luogo consegna</p>
                <p className="font-semibold">{orderInfo.luogoConsegna}</p>
              </div>
            </div>
          )}
          {orderInfo.dataConsegna && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data consegna</p>
                <p className="font-semibold">
                  {new Date(orderInfo.dataConsegna).toLocaleDateString("it-IT", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                </p>
              </div>
            </div>
          )}
          {orderInfo.note && (
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Note</p>
                <p className="font-medium text-foreground/80">{orderInfo.note}</p>
              </div>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Articoli</span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">trascina per riordinare</span>
            <Badge className="ml-auto rounded-full px-2.5 text-xs">{flaggedCount}</Badge>
          </div>
          <div className="px-3 py-3">
            <OrderLinesEditor
              store="order"
              mode="summary"
              onEditArticle={handleEditItemInCatalog}
              onEditLine={handleEditLine}
              onAddNoteAbove={handleAddNoteAbove}
              showTrasportoControl
            />
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Totale pezzi</span>
              <span className="font-bold">{totalPz} pz</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Totale imponibile</span>
              <span className="font-bold text-base">{formatOrderCurrency(totalImponibile)}</span>
            </div>
          </div>
        </div>

        {requiresApproval && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Questo ordine contiene <strong>sconti liberi</strong> (diversi da 0, 8% e 15%): verrà inviato a un amministratore per
              approvazione e partirà per il magazzino solo dopo il suo via libera.
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col-reverse gap-3 mt-2 sm:flex-row">
          <Button
            variant="outline"
            className="h-11 gap-2 px-4 w-full justify-center sm:w-auto"
            onClick={() => setStep(3)}
            disabled={saving}
          >
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 gap-2 font-semibold border-dashed sm:flex-1"
            onClick={() => handleSave("bozza")}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isModificationEditing && hasOpenModificationDraft ? "Aggiorna bozza" : "Salva bozza"}
          </Button>
          <Button
            className="w-full h-11 gap-2 font-semibold sm:flex-1"
            onClick={() => handleSave("confermato")}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {requiresApproval ? "Invia per approvazione" : isModificationEditing ? "Invia modifica" : "Invia a magazzino"}
          </Button>
        </div>
      </div>
    </div>
  );
}
