"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  User, Warehouse, MapPin, Calendar, MessageSquare,
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
  Package, Send, Save, ShoppingCart, X, ShieldAlert, Hash,
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
import { CIG_LENGTH, CUP_LENGTH, isValidCig, isValidCup, normalizeCig, normalizeCup } from "@/lib/cig-cup";
import { calculateOrderDiscountedTotal, formatOrderCurrency, formatOrderQuantitiesByUnit } from "@/lib/order-totals";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import { MAGAZZINI, type AnagraficaSearchItem, type OrderHistoryItem } from "@/types";
import type { Order, OrderLine } from "@/types";
import ExitOrderDialog from "@/components/ExitOrderDialog";
import WizardStepper, { WIZARD_BACK_HREF, useWizardBackGuard } from "@/components/WizardStepper";
import WizardHeader from "@/components/WizardHeader";
import { LOGOUT_HREF, useNavigationGuard } from "@/lib/navigation-guard";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Cliente", "Materiali", "Dettagli", "Riepilogo"] as const;
const WIZARD_EYEBROW = "Ordini";
const EXIT_HREF = "/orders";
/** Un solo toast d'errore di salvataggio alla volta, tolto quando un tentativo va a buon fine. */
const SAVE_ERROR_TOAST_ID = "order-save-error";
/** Layout con la sidebar del carrello al posto del drawer (breakpoint lg). */
const SIDEBAR_MEDIA = "(min-width: 64rem)";
/** Chiave localStorage: il carrello persistito appartiene a un nuovo ordine (riprendibile) o a una modifica. */
export const ORDER_WIZARD_ORIGIN_KEY = "listino-order-wizard-origin";

interface PublicCodeFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  length: number;
  showError: boolean;
  onChange: (value: string) => void;
}

/** Campo CIG/CUP: facoltativo, maiuscolo, lunghezza fissa (avviso in rosso se incompleto al passaggio al riepilogo). */
function PublicCodeField({ id, label, hint, value, length, showError, onChange }: PublicCodeFieldProps) {
  const invalid = showError && value !== "" && value.length !== length;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <Input
        id={id}
        placeholder={`${length} caratteri (opzionale)`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="h-12 rounded-lg text-base bg-card font-mono tracking-wide placeholder:font-sans placeholder:tracking-normal"
        style={{ fontSize: "16px" }}
      />
      {invalid ? (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          Il {label} deve avere {length} caratteri ({value.length}/{length}).
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {hint}{value ? ` · ${value.length}/${length}` : ""}
        </p>
      )}
    </div>
  );
}

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
  // Magazzino mancante e CIG/CUP incompleti: l'avviso compare solo dopo il tentativo di passare al riepilogo.
  const [showMagazzinoError, setShowMagazzinoError] = useState(false);
  const [showPublicCodeErrors, setShowPublicCodeErrors] = useState(false);
  /** Incrementato quando la validazione dello step Dettagli fallisce: porta a schermo il primo campo in errore. */
  const [detailsErrorTick, setDetailsErrorTick] = useState(0);

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
  const cartAsideRef = useRef<HTMLElement>(null);

  const { user, logout } = useAuth();
  const isEditing = !!editingOrder;
  const editingSource = editingOrder?.draft ?? editingOrder;
  /** Ordine mai inviato al magazzino (bozza o in attesa di approvazione): si salva/invia come nuovo, non come modifica. */
  const isStandaloneDraft =
    (editingOrder?.status === "bozza" || editingOrder?.status === "in_approvazione") && editingOrder.parentOrderId === null;
  const isModificationEditing = !!editingOrder && !isStandaloneDraft;
  const hasOpenModificationDraft = !!editingOrder?.draft;

  // Il carrello persistito di un nuovo ordine si può riprendere dopo una ricarica (vedi /orders/new), quello di una modifica no.
  useEffect(() => {
    try {
      localStorage.setItem(ORDER_WIZARD_ORIGIN_KEY, isEditing ? "edit" : "new");
    } catch {
      // storage non disponibile: /orders/new riparte semplicemente da zero
    }
  }, [isEditing]);

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
      cig: editingSource.cig ?? "",
      cup: editingSource.cup ?? "",
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
  /** Quantità per unità di misura ("4 pz · 13,5 mq"): unità diverse non si sommano. */
  const quantitiesLabel = formatOrderQuantitiesByUnit(lines);
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

  // Ogni step si apre dall'alto; fanno eccezione le richieste che scorrono da sole (articolo da modificare, casella righe).
  useEffect(() => {
    if (pendingLineRequestRef.current || openArticleRequest) return;
    window.scrollTo({ top: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Validazione dello step Dettagli fallita: il primo campo in errore viene portato a schermo.
  useEffect(() => {
    if (detailsErrorTick === 0) return;
    document.querySelector("[data-details-step] [aria-invalid='true']")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [detailsErrorTick]);

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

  // Sidebar del carrello (da lg): alta quanto lo spazio visibile sotto il suo bordo superiore, così "Indietro/Avanti"
  // restano a schermo anche prima che si agganci sotto l'header sticky (tablet in orizzontale, pagina non ancora scorsa).
  useEffect(() => {
    const aside = cartAsideRef.current;
    const header = stickyHeaderRef.current;
    if (!aside || !header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = Math.max(aside.getBoundingClientRect().top, 0);
      aside.style.maxHeight = `${Math.max(window.innerHeight - top - 20, 200)}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(header);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
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

  /** `fill`: nella sidebar l'elenco righe occupa lo spazio rimasto e scorre da solo (totale e pulsanti restano visibili). */
  const renderCartSummary = (itemsHeightClass: string, fill = false) => (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight font-bold text-foreground">Carrello</p>
          <p className="text-[13px] text-muted-foreground">
            {flaggedCount > 0 ? `${flaggedCount} ${flaggedCount === 1 ? "articolo" : "articoli"} · ${quantitiesLabel}` : "Nessun articolo selezionato"}
          </p>
        </div>
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <ShoppingCart className="h-5 w-5" />
          {flaggedCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-brand-yellow px-1 text-[10px] font-extrabold text-primary">
            {flaggedCount}
          </span>
        )}
        </span>
      </div>
      {/* Almeno una riga sempre visibile: se lo spazio non basta scorre l'intera sidebar (pulsanti fissati in fondo). */}
      <div className={cn("flex flex-col gap-2", fill && "min-h-28 flex-auto")}>
        <p className="px-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Righe ordine</p>
        <OrderLinesEditor
          store="order"
          mode="cart"
          onEditArticle={handleEditItemInCatalog}
          onEditLine={handleEditLine}
          onAddNoteAbove={handleAddNoteAbove}
          listHeightClass={itemsHeightClass}
          className={fill ? "min-h-0 flex-auto" : undefined}
        />
      </div>
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-t border-border px-1 pt-3">
        <span className="text-sm font-semibold text-foreground/80">Totale imponibile</span>
        <span className="font-display text-2xl font-bold tabular-nums text-foreground">{formatOrderCurrency(totalImponibile)}</span>
      </div>
    </>
  );

  // Uscita dal wizard (pulsante Esci o link della navigazione): con dati inseriti passa dalla conferma.
  const [exitTarget, setExitTarget] = useState(EXIT_HREF);
  const hasProgress = orderInfo.cliente.trim() !== "" || lines.length > 0;
  const setNavigationGuard = useNavigationGuard((s) => s.setGuard);

  const requestExit = useCallback((href: string) => {
    if (!hasProgress) {
      router.push(href);
      return;
    }
    setExitTarget(href);
    setExitDialogOpen(true);
  }, [hasProgress, router, setExitDialogOpen]);

  useEffect(() => {
    setNavigationGuard((href) => {
      if (!hasProgress) return true;
      setExitTarget(href);
      setExitDialogOpen(true);
      return false;
    });
    return () => setNavigationGuard(null);
  }, [hasProgress, setExitDialogOpen, setNavigationGuard]);

  /** Gesto/pulsante indietro del browser: chiude conferma o carrello, poi torna allo step precedente; dallo step 1 chiede conferma. */
  const handleBrowserBack = (): boolean => {
    if (saving || savingDraft) return true;
    if (exitDialogOpen) {
      setExitDialogOpen(false);
      return true;
    }
    if (mobileCartOpen) {
      setMobileCartOpen(false);
      return true;
    }
    if (currentStep > 1) {
      setStep((currentStep - 1) as 1 | 2 | 3);
      return true;
    }
    if (!hasProgress) return false;
    setExitTarget(WIZARD_BACK_HREF);
    setExitDialogOpen(true);
    return true;
  };
  const leaveToPreviousPage = useWizardBackGuard({ enabled: !saved, onBack: handleBrowserBack, fallbackHref: EXIT_HREF });

  /** Uscita confermata: il logout chiude davvero la sessione, "indietro" torna alla pagina precedente al wizard. */
  const leaveWizard = useCallback((target: string) => {
    if (target === LOGOUT_HREF) void logout();
    else if (target === WIZARD_BACK_HREF) leaveToPreviousPage();
    else router.push(target);
  }, [leaveToPreviousPage, logout, router]);

  const wizardTitle = editingOrder ? `Modifica ordine #${editingOrder.id}` : "Nuovo ordine";
  const wizardCustomer = orderInfo.cliente.trim();

  /** Una bozza richiede cliente e almeno un articolo (il magazzino si sceglie anche dopo). */
  const canSaveDraft = orderInfo.cliente.trim() !== "" && flaggedCount > 0;

  const handleSaveDraftAndExit = useCallback(async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    let error: string | null = null;
    try {
      const request = getRequestConfig("bozza");
      const res = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        error = data?.error || "Errore nel salvataggio della bozza.";
      }
    } catch {
      error = "Connessione non disponibile. Riprova.";
    }
    setSavingDraft(false);
    // Bozza non salvata: si resta nel wizard (dialog aperto) con i dati intatti.
    if (error) {
      toast.error("Bozza non salvata", { id: SAVE_ERROR_TOAST_ID, description: error });
      return;
    }
    toast.dismiss(SAVE_ERROR_TOAST_ID);
    toast.success("Bozza salvata");
    resetOrder();
    setExitDialogOpen(false);
    leaveWizard(exitTarget);
  }, [exitTarget, getRequestConfig, leaveWizard, resetOrder, savingDraft, setExitDialogOpen]);

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

      toast.dismiss(SAVE_ERROR_TOAST_ID);
      const resultStatus = data?.status ?? data?.order?.status;
      const pendingApproval = data?.pendingApproval === true || resultStatus === "in_approvazione";
      setSavedMessage(getSuccessMessage(status, pendingApproval));
      setSaved(true);
      resetOrder();
      // `saved` resta vero fino al cambio pagina: altrimenti ricomparirebbe per un attimo lo step 1 vuoto.
      setTimeout(() => router.push("/orders"), pendingApproval ? 1800 : 1200);
    } catch (err) {
      const message =
        err instanceof TypeError ? "Connessione non disponibile. Riprova." : err instanceof Error && err.message ? err.message : "Errore nel salvataggio dell'ordine.";
      toast.error(status === "bozza" ? "Bozza non salvata" : "Ordine non inviato", { id: SAVE_ERROR_TOAST_ID, description: message });
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
        onSaveDraft={canSaveDraft ? handleSaveDraftAndExit : undefined}
        description={
          canSaveDraft
            ? undefined
            : "Per salvare una bozza servono il cliente e almeno un articolo: uscendo ora i dati inseriti andranno persi."
        }
        onExitWithoutSaving={() => { resetOrder(); setExitDialogOpen(false); leaveWizard(exitTarget); }}
        onContinue={() => setExitDialogOpen(false)}
      />
    );

  const magazzinoInvalid = showMagazzinoError && !orderInfo.magazzino;

  /** Uno step è raggiungibile dallo stepper se tutti i precedenti sono completi (in modifica lo sono tutti). */
  const canReachStep = (step: 1 | 2 | 3 | 4): boolean => {
    if (step === 1) return true;
    if (step === 2) return canGoNextStep1;
    return canGoNextStep1 && canGoNextStep2;
  };

  /**
   * Validazione dello step Dettagli prima del riepilogo: magazzino scelto, CIG/CUP completi (se inseriti)
   * e indirizzo digitato valido (verificato solo con lo step aperto; altrimenti vale l'ultimo esito).
   */
  const validateDetailsStep = async (): Promise<boolean> => {
    const missingMagazzino = !orderInfo.magazzino;
    const invalidCodes = !isValidCig(orderInfo.cig) || !isValidCup(orderInfo.cup);
    if (missingMagazzino || invalidCodes) {
      setShowMagazzinoError(missingMagazzino);
      if (invalidCodes) setShowPublicCodeErrors(true);
      setDetailsErrorTick((tick) => tick + 1);
      return false;
    }
    if (!orderInfo.luogoConsegna.trim() || isAddressValid) return true;
    return currentStep === 3 && (await addressInputRef.current?.validateAddress()) === true;
  };

  const goToStep = async (step: 1 | 2 | 3 | 4) => {
    if (step === currentStep || !canReachStep(step)) return;
    // Verso il riepilogo (anche saltando lo step Dettagli dallo stepper) vale la validazione di "Avanti — Riepilogo":
    // se non passa si apre lo step Dettagli con gli errori in evidenza.
    if (step === 4 && !(await validateDetailsStep())) {
      if (currentStep !== 3) {
        setMobileCartOpen(false);
        setStep(3);
      }
      return;
    }
    setMobileCartOpen(false);
    setStep(step);
  };

  const Stepper = () => (
    <>
      <WizardHeader eyebrow={WIZARD_EYEBROW} title={wizardTitle} subtitle={wizardCustomer || undefined} onExit={() => requestExit(EXIT_HREF)} />
      <WizardStepper
        labels={STEP_LABELS}
        currentStep={currentStep}
        canReachStep={canReachStep}
        onStepClick={(step) => void goToStep(step)}
      />
    </>
  );

  // Conferma dopo il salvataggio: va prima degli step perché resetOrder() riporta subito lo store allo step 1.
  if (saved) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8 flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 role="status" className="font-display text-2xl font-bold tracking-tight">{savedMessage}</h2>
        <p className="text-sm text-muted-foreground">Reindirizzamento agli ordini…</p>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 1 — Cliente
  // ────────────────────────────────────────────
  if (currentStep === 1) {
    return (
        <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8">
          {exitDialog}
          <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-1">Seleziona cliente</h2>
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
                className="h-12 rounded-lg text-base bg-card"
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
                          <p className="text-sm font-medium line-clamp-2 wrap-break-word">{customer.ragioneSociale}</p>
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
        <div className="max-w-6xl mx-auto w-full px-4 pt-6 lg:pt-8">
          <Stepper />
        </div>
        <div ref={stickyHeaderRef} className="sticky top-[var(--app-header-h)] z-30 bg-background border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2.5 lg:pr-[22rem] lg:has-[[data-composer-open]]:pr-4">
            <SearchBar autoFocus />
            <div>
              <QuickLineComposer ref={composerRef} store="order" onAdded={handleArticleConfirmed} />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row max-w-6xl mx-auto w-full">
          {/* Materials catalog */}
          <main className="flex-1 min-w-0 px-4 py-5">
            <MaterialList
              onArticleConfirmed={handleArticleConfirmed}
              openArticleRequest={openArticleRequest}
              onOpenArticleRequestHandled={handleOpenArticleRequestHandled}
              onCreateManualFromSearch={handleCreateManualFromSearch}
              stickyTop="var(--app-header-h) + var(--step2-header-h)"
            />
          </main>

          {/* Sticky sidebar */}
          <aside
            ref={cartAsideRef}
            className="hidden lg:flex w-80 shrink-0 flex-col gap-4 my-5 mr-4 rounded-2xl border border-border/80 bg-card p-5 shadow-panel sticky self-start overflow-y-auto"
            style={{ top: "calc(var(--app-header-h) + var(--step2-header-h) + 1.25rem)", maxHeight: "calc(100dvh - var(--app-header-h) - var(--step2-header-h) - 2.5rem)" }}
          >
            {renderCartSummary("min-h-0 flex-auto", true)}
            <div className="sticky bottom-0 -mb-5 flex shrink-0 gap-2 bg-card pb-5">
              <Button variant="outline" size="lg" className="px-4" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4" />
                Indietro
              </Button>
              <Button size="lg" className="flex-1 px-4" disabled={!canGoNextStep2} onClick={() => setStep(3)}>
                Avanti
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </aside>
        </div>

        {/* Mobile cart drawer */}
        <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen} closeOnMedia={SIDEBAR_MEDIA}>
          <DrawerContent className="lg:hidden p-0 rounded-t-3xl">
            <DrawerHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Carrello articoli
                </DrawerTitle>
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="size-10 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center"
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
        <div className="lg:hidden sticky bottom-[var(--app-tabbar-h)] z-30 flex items-center gap-2.5 border-t border-border bg-card px-4 py-3 shadow-[0_-10px_30px_-18px_rgb(15_27_45/0.35)]">
          <Button
            variant="outline"
            size="icon"
            className="size-12 shrink-0"
            aria-label="Indietro"
            onClick={() => {
              setMobileCartOpen(false);
              setStep(1);
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            aria-label={`Apri carrello, ${flaggedCount} articoli`}
            className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border border-input bg-card px-3 text-left transition-colors hover:border-primary/40 active:bg-muted"
          >
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <ShoppingCart className="h-[18px] w-[18px]" />
              {flaggedCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-brand-yellow px-1 text-[10px] font-extrabold text-primary">
            {flaggedCount}
          </span>
        )}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-xs font-medium text-muted-foreground">Carrello · {flaggedCount} {flaggedCount === 1 ? "articolo" : "articoli"}</span>
              <span className="truncate text-[15px] font-bold tabular-nums text-foreground">{formatOrderCurrency(totalImponibile)}</span>
            </span>
          </button>
          <Button
            className="h-12 shrink-0 px-4 text-[15px]"
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
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8">
          {exitDialog}
        <Stepper />
        <div className="flex flex-col gap-4" data-details-step>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-1">Dettagli ordine</h2>
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
              aria-invalid={magazzinoInvalid || undefined}
              aria-describedby={magazzinoInvalid ? "magazzino-error" : undefined}
              className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20"
              style={{ fontSize: "16px" }}
            >
              <option value="">Seleziona magazzino…</option>
              {MAGAZZINI.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {magazzinoInvalid && (
              <p id="magazzino-error" role="alert" className="text-[11px] font-medium text-destructive">
                Seleziona il magazzino a cui inviare l&apos;ordine.
              </p>
            )}
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
              className="h-12 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
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
              className="h-12 rounded-lg text-base bg-card"
              style={{ fontSize: "16px" }}
            />
          </div>

          {/* CIG / CUP (fatturazione PA) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PublicCodeField
              id="cig"
              label="CIG"
              hint="Codice Identificativo Gara"
              value={orderInfo.cig}
              length={CIG_LENGTH}
              showError={showPublicCodeErrors}
              onChange={(value) => setOrderInfo({ cig: normalizeCig(value) })}
            />
            <PublicCodeField
              id="cup"
              label="CUP"
              hint="Codice Unico di Progetto"
              value={orderInfo.cup}
              length={CUP_LENGTH}
              showError={showPublicCodeErrors}
              onChange={(value) => setOrderInfo({ cup: normalizeCup(value) })}
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
              className="h-12 rounded-lg text-base bg-card"
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
              className="rounded-lg text-base bg-card resize-none"
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
              onClick={() => void goToStep(4)}
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
  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8">
        {exitDialog}
      <Stepper />
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-1">Riepilogo ordine</h2>
          <p className="text-sm text-muted-foreground">
            {isModificationEditing
              ? "Controlla i dati prima di salvare la bozza o inviare la modifica."
              : "Controlla i dati prima di salvare o inviare."}
          </p>
        </div>

        {/* Cliente + dettagli */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-card p-4 flex flex-col gap-3 text-sm">
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
          {(orderInfo.cig || orderInfo.cup) && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {orderInfo.cig && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CIG</p>
                    <p className="font-semibold font-mono">{orderInfo.cig}</p>
                  </div>
                )}
                {orderInfo.cup && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CUP</p>
                    <p className="font-semibold font-mono">{orderInfo.cup}</p>
                  </div>
                )}
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
        <div className="rounded-2xl border border-border/80 bg-card shadow-card overflow-hidden">
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
            <div className="flex items-baseline justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">Quantità</span>
              <span className="text-right font-bold">{quantitiesLabel}</span>
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
