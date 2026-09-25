"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MapPin,
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
import AddressAutocompleteInput, {
  type AddressAutocompleteInputHandle,
  type AddressData,
} from "@/components/AddressAutocompleteInput";
import MaterialList from "@/components/MaterialList";
import WizardStepper, { WIZARD_BACK_HREF, useWizardBackGuard } from "@/components/WizardStepper";
import WizardHeader from "@/components/WizardHeader";
import ExitOrderDialog from "@/components/ExitOrderDialog";
import { LOGOUT_HREF, useNavigationGuard } from "@/lib/navigation-guard";
import OrderLinesEditor from "@/components/OrderLinesEditor";
import QuickLineComposer, { type LineComposerRequest, type QuickLineComposerHandle } from "@/components/QuickLineComposer";
import SearchBar from "@/components/SearchBar";
import { countArticleLines, itemsRequireApproval } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, formatOrderCurrency, formatOrderQuantitiesByUnit } from "@/lib/order-totals";
import { useAuth } from "@/lib/auth-context";
import { useQuotationStore } from "@/lib/useQuotationStore";
import { cn } from "@/lib/utils";
import { VALIDITA_PREVENTIVO_GIORNI, type AnagraficaSearchItem, type OrderLine, type Quotation } from "@/types";

const STEP_LABELS = ["Cliente", "Materiali", "Dati", "Riepilogo"] as const;
const WIZARD_EYEBROW = "Preventivi";
const EXIT_HREF = "/quotations";
const SAVE_ERROR_TOAST_ID = "quotation-save-error";
/** Layout con la sidebar del carrello al posto del drawer (breakpoint lg). */
const SIDEBAR_MEDIA = "(min-width: 64rem)";
/** Chiave localStorage: il preventivo persistito è nuovo (riprendibile da /quotations/new) o una modifica. */
export const QUOTATION_WIZARD_ORIGIN_KEY = "listino-quotation-wizard-origin";

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

/** Numero documento senza punti di a capo ai trattini (word joiner): "PREV-2026-" / "0002" non si spezza. */
function unbreakableNumber(numero: string) {
  return numero.replace(/-/g, "-\u2060");
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
  // Casella righe manuali/note (sticky sotto la ricerca): la richiesta di apertura resta in attesa finché lo step 2 non è montato.
  const composerRef = useRef<QuickLineComposerHandle>(null);
  const pendingLineRequestRef = useRef<{ request: LineComposerRequest; fromOtherStep: boolean } | null>(null);
  const [lineRequestTick, setLineRequestTick] = useState(0);
  // Altezza dell'header sticky (ricerca + casella): la sidebar desktop si aggancia subito sotto.
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const step2RootRef = useRef<HTMLDivElement>(null);
  const cartAsideRef = useRef<HTMLElement>(null);

  // Destinazione cantiere (opzionale), stesso componente e validazione degli ordini
  const addressInputRef = useRef<AddressAutocompleteInputHandle>(null);
  const addressDataRef = useRef<AddressData | null>(null);
  const [isAddressValid, setIsAddressValid] = useState(true);
  const [recentDestinations, setRecentDestinations] = useState<string[]>([]);
  const [recentDestinationsLoading, setRecentDestinationsLoading] = useState(false);
  const [selectedRecentDestination, setSelectedRecentDestination] = useState("");
  /** Riepilogo richiesto dallo stepper con una destinazione da verificare: si valida appena lo step Dati è montato. */
  const pendingSummaryRef = useRef(false);

  const { user, logout } = useAuth();
  const isEditing = !!editingQuotation;

  // Il preventivo persistito di un nuovo documento si può riprendere dopo una ricarica (vedi /quotations/new), quello di una modifica no.
  useEffect(() => {
    try {
      localStorage.setItem(QUOTATION_WIZARD_ORIGIN_KEY, isEditing ? "edit" : "new");
    } catch {
      // storage non disponibile: /quotations/new riparte semplicemente da zero
    }
  }, [isEditing]);

  // Uscita dal wizard (pulsante Esci o link della navigazione): con dati inseriti passa dalla conferma.
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [exitTarget, setExitTarget] = useState(EXIT_HREF);
  const hasProgress = quotationInfo.cliente.trim() !== "" || lines.length > 0;
  const setNavigationGuard = useNavigationGuard((s) => s.setGuard);

  const requestExit = useCallback((href: string) => {
    if (!hasProgress) {
      router.push(href);
      return;
    }
    setExitTarget(href);
    setExitDialogOpen(true);
  }, [hasProgress, router]);

  useEffect(() => {
    setNavigationGuard((href) => {
      if (!hasProgress) return true;
      setExitTarget(href);
      setExitDialogOpen(true);
      return false;
    });
    return () => setNavigationGuard(null);
  }, [hasProgress, setNavigationGuard]);

  const wizardTitle = editingQuotation ? `Modifica preventivo ${unbreakableNumber(editingQuotation.numero)}` : "Nuovo preventivo";
  const wizardCustomer = quotationInfo.cliente.trim();

  useEffect(() => {
    if (!editingQuotation) return;

    setQuotationInfo({
      clienteId: editingQuotation.clienteId,
      cliente: editingQuotation.cliente,
      dataPreventivo: editingQuotation.dataPreventivo,
      dataConsegnaPrevista: editingQuotation.dataConsegnaPrevista || editingQuotation.dataPreventivo || today(),
      luogoConsegna: editingQuotation.luogoConsegna ?? "",
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

  // Ogni step si apre dall'alto; fanno eccezione le richieste che scorrono da sole (articolo da modificare, casella righe).
  useEffect(() => {
    if (pendingLineRequestRef.current || openArticleRequest) return;
    window.scrollTo({ top: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Destinazioni recenti del cliente selezionato da anagrafica (come negli ordini)
  useEffect(() => {
    if (!quotationInfo.clienteId) {
      setRecentDestinations([]);
      setRecentDestinationsLoading(false);
      setSelectedRecentDestination("");
      return;
    }

    let cancelled = false;
    setRecentDestinationsLoading(true);

    fetch(`/api/anagrafiche/${quotationInfo.clienteId}/recent-destinations?limit=8`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.destinations) ? data.destinations : [];
      })
      .then((destinations: string[]) => {
        if (!cancelled) setRecentDestinations(destinations);
      })
      .catch(() => {
        if (!cancelled) setRecentDestinations([]);
      })
      .finally(() => {
        if (!cancelled) setRecentDestinationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quotationInfo.clienteId]);

  const handleDeliveryAddressChange = useCallback((value: string) => {
    setQuotationInfo({ luogoConsegna: value });
    if (selectedRecentDestination && value !== selectedRecentDestination) {
      setSelectedRecentDestination("");
    }
  }, [selectedRecentDestination, setQuotationInfo]);

  const handleAddressResolved = useCallback((data: AddressData) => {
    addressDataRef.current = data;
    if (data.address) setQuotationInfo({ luogoConsegna: data.address });
  }, [setQuotationInfo]);

  /**
   * Verso il riepilogo una destinazione digitata si valida (geocoding) come negli ordini: il campo esiste solo
   * con lo step Dati aperto, altrimenti vale l'ultimo esito.
   */
  const validateDestination = useCallback(async () => {
    if (!quotationInfo.luogoConsegna.trim() || isAddressValid) return true;
    return currentStep === 3 && (await addressInputRef.current?.validateAddress()) === true;
  }, [currentStep, isAddressValid, quotationInfo.luogoConsegna]);

  const flaggedCount = countArticleLines(lines);
  /** Quantità per unità di misura ("4 pz · 13,5 mq"): unità diverse non si sommano. */
  const quantitiesLabel = formatOrderQuantitiesByUnit(lines);
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
    setSelectedRecentDestination("");
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

  // Riepilogo chiesto dallo stepper con la destinazione ancora da verificare: la si valida nello step Dati appena
  // montato e, se va bene, si prosegue; altrimenti resta aperto con l'errore sul campo.
  useEffect(() => {
    if (currentStep !== 3 || !pendingSummaryRef.current) return;
    pendingSummaryRef.current = false;
    // Un giro dopo il montaggio: il campo ha già collegato Google Maps (se caricato) e può fare il geocoding.
    const timer = window.setTimeout(async () => {
      if ((await addressInputRef.current?.validateAddress()) === true) {
        setStep(4);
        return;
      }
      document.getElementById("luogo")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentStep, setStep]);

  const handleEditLine = useCallback((line: OrderLine) => {
    openLineComposer({ kind: line.tipo === "commento" ? "nota" : "manuale", line });
  }, [openLineComposer]);

  const handleAddNoteAbove = useCallback((beforeId: string) => {
    openLineComposer({ kind: "nota", beforeId });
  }, [openLineComposer]);

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

      toast.dismiss(SAVE_ERROR_TOAST_ID);
      const id = data?.quotation?.id ?? data?.id ?? editingQuotation?.id;
      const pending = data?.quotation?.status === "in_approvazione";
      setSavedPendingApproval(pending);
      setSaved(true);
      resetQuotation();
      setTimeout(() => router.push(id ? `/quotations/${id}` : "/quotations"), pending ? 1600 : 900);
    } catch (err) {
      const message =
        err instanceof TypeError ? "Connessione non disponibile. Riprova." : err instanceof Error && err.message ? err.message : "Errore nel salvataggio del preventivo.";
      toast.error("Preventivo non salvato", { id: SAVE_ERROR_TOAST_ID, description: message });
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

  const goToStep = async (step: 1 | 2 | 3 | 4) => {
    if (step === currentStep || !canReachStep(step)) return;
    // Verso il riepilogo (anche saltando lo step Dati dallo stepper) vale la validazione del pulsante "Riepilogo":
    // se non passa si apre lo step Dati, che verifica la destinazione e mostra l'errore.
    if (step === 4 && !(await validateDestination())) {
      if (currentStep !== 3) {
        pendingSummaryRef.current = true;
        setMobileCartOpen(false);
        setStep(3);
      } else {
        document.getElementById("luogo")?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    setMobileCartOpen(false);
    setStep(step);
  };

  /** Gesto/pulsante indietro del browser: chiude conferma o carrello, poi torna allo step precedente; dallo step 1 chiede conferma. */
  const handleBrowserBack = (): boolean => {
    if (saving) return true;
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

  const Stepper = () => (
    <>
      <ExitOrderDialog
        open={exitDialogOpen}
        title="Preventivo in corso"
        description="Il preventivo non è ancora stato salvato: se esci ora, i dati inseriti andranno persi."
        onExitWithoutSaving={() => {
          resetQuotation();
          setExitDialogOpen(false);
          leaveWizard(exitTarget);
        }}
        onContinue={() => setExitDialogOpen(false)}
      />
      <WizardHeader eyebrow={WIZARD_EYEBROW} title={wizardTitle} subtitle={wizardCustomer || undefined} onExit={() => requestExit(EXIT_HREF)} />
      <WizardStepper
        labels={STEP_LABELS}
        currentStep={currentStep}
        canReachStep={canReachStep}
        onStepClick={(step) => void goToStep(step)}
      />
    </>
  );

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
        <p className="px-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Righe preventivo</p>
        <OrderLinesEditor
          store="quotation"
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
        <span className="font-display text-2xl font-bold tabular-nums text-foreground">{formatCurrency(total)}</span>
      </div>
    </>
  );

  if (saved) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8 flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{savedPendingApproval ? "Preventivo inviato per approvazione" : "Preventivo salvato"}</h2>
        <p className="text-sm text-muted-foreground">
          {savedPendingApproval ? "Un amministratore deve approvare gli sconti liberi prima che sia utilizzabile. Apro il dettaglio..." : "Apro il dettaglio..."}
        </p>
      </div>
    );
  }

  if (currentStep === 1) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8">
        <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-1">Cliente preventivo</h2>
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
                // In modifica il cliente c'è già: niente tastiera né suggerimenti all'apertura (si aprono scrivendo).
                autoFocus={!isEditing}
                onFocus={() => {
                  if (!quotationInfo.clienteId) setCustomerDropdownOpen(true);
                }}
                onBlur={() => { setTimeout(() => setCustomerDropdownOpen(false), 120); }}
                onChange={(event) => {
                  setQuotationInfo({ cliente: event.target.value, clienteId: null });
                  setCustomerDropdownOpen(true);
                }}
                className="h-12 rounded-lg text-base bg-card"
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
      <div ref={step2RootRef} className="min-h-dvh flex flex-col" style={{ "--step2-header-h": "49px" } as CSSProperties}>
        {/* Header sticky: ricerca + casella righe manuali/note, sempre visibili scorrendo la lista */}
        <div className="max-w-6xl mx-auto w-full px-4 pt-6 lg:pt-8">
          <Stepper />
        </div>
        <div ref={stickyHeaderRef} className="sticky top-[var(--app-header-h)] z-30 bg-background border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2.5 lg:pr-[22rem] lg:has-[[data-composer-open]]:pr-4">
            <SearchBar ref={searchInputRef} autoFocus store="quotation" />
            <div>
              <QuickLineComposer ref={composerRef} store="quotation" onAdded={handleArticleConfirmed} />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row max-w-6xl mx-auto w-full">
          <main className="flex-1 min-w-0 px-4 py-5">
            <MaterialList
              store="quotation"
              onArticleConfirmed={handleArticleConfirmed}
              openArticleRequest={openArticleRequest}
              onOpenArticleRequestHandled={handleOpenArticleRequestHandled}
              onCreateManualFromSearch={handleCreateManualFromSearch}
              stickyTop="var(--app-header-h) + var(--step2-header-h)"
            />
          </main>

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

        <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen} closeOnMedia={SIDEBAR_MEDIA}>
          <DrawerContent className="lg:hidden p-0 rounded-t-3xl">
            <DrawerHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Articoli preventivo
                </DrawerTitle>
                <DrawerClose asChild>
                  <button type="button" className="size-10 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center" aria-label="Chiudi carrello">
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

        <div className="lg:hidden sticky bottom-[var(--app-tabbar-h)] z-30 flex items-center gap-2.5 border-t border-border bg-card px-4 py-3 shadow-[0_-10px_30px_-18px_rgb(15_27_45/0.35)]">
          <Button
            variant="outline"
            size="icon"
            className="size-12 shrink-0"
            aria-label="Indietro"
            onClick={() => setStep(1)}
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
              <span className="truncate text-[15px] font-bold tabular-nums text-foreground">{formatCurrency(total)}</span>
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

  if (currentStep === 3) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8">
        <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-1">Dati preventivo</h2>
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
              className="h-12 rounded-lg text-base bg-card"
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="luogo" className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Destinazione cantiere
            </Label>
            <select
              value={selectedRecentDestination}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedRecentDestination(value);
                if (value) setQuotationInfo({ luogoConsegna: value });
              }}
              disabled={!quotationInfo.clienteId || recentDestinationsLoading || recentDestinations.length === 0}
              className="h-12 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <option value="">
                {recentDestinationsLoading
                  ? "Caricamento destinazioni recenti..."
                  : !quotationInfo.clienteId
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
            <AddressAutocompleteInput
              ref={addressInputRef}
              id="luogo"
              placeholder="Indirizzo del cantiere (opzionale)"
              value={quotationInfo.luogoConsegna}
              onChange={handleDeliveryAddressChange}
              onAddressResolved={handleAddressResolved}
              onValidityChange={(valid) => {
                setIsAddressValid(valid);
                if (!valid) addressDataRef.current = null;
              }}
              className="h-12 rounded-lg text-base bg-card"
              style={{ fontSize: "16px" }}
            />
            <p className="text-xs text-muted-foreground">Se lasci vuoto, nel PDF la destinazione sarà &quot;STESSA&quot; (sede del cliente).</p>
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
              className="rounded-lg text-base bg-card resize-none"
              rows={4}
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 mt-2 sm:flex-row">
            <Button variant="outline" className="w-full h-11 gap-2 sm:flex-1" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button
              className="w-full h-11 gap-2 font-semibold sm:flex-1"
              disabled={!canGoNextStep3}
              onClick={() => void goToStep(4)}
            >
              Riepilogo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10 lg:pt-8">
      <Stepper />
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-1">Riepilogo preventivo</h2>
          <p className="text-sm text-muted-foreground">Controlla i dati prima di salvare.</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card shadow-card p-4 flex flex-col gap-3 text-sm">
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
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Destinazione cantiere</p>
              <p className="font-semibold">{quotationInfo.luogoConsegna.trim() || "Stessa del cliente"}</p>
            </div>
          </div>
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

        <div className="rounded-2xl border border-border/80 bg-card shadow-card overflow-hidden">
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
              onEditLine={handleEditLine}
              onAddNoteAbove={handleAddNoteAbove}
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

        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => requestExit(EXIT_HREF)} disabled={saving}>
          <FileText className="h-4 w-4" />
          Torna ai preventivi
        </Button>
      </div>
    </div>
  );
}