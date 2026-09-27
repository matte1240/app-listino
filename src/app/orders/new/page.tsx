"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, FileText, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import { countArticleLines } from "@/lib/order-lines";
import OrderWizard, { ORDER_WIZARD_ORIGIN_KEY } from "@/components/OrderWizard";
import { useDropStaleBackGuard } from "@/components/WizardStepper";
import type { Material, Quotation } from "@/types";

type PrefillState = "idle" | "loading" | "ready" | "error";

async function fetchMaterials(): Promise<Material[]> {
  const res = await fetch("/api/materials");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.materials) ? data.materials : [];
}

/** Nuovo ordine lasciato a metà (ricarica, scheda chiusa o sospesa dal tablet) ancora nello store persistito. */
function hasResumableOrder(): boolean {
  try {
    if (localStorage.getItem(ORDER_WIZARD_ORIGIN_KEY) !== "new") return false;
  } catch {
    return false;
  }
  const { orderInfo, lines } = useOrderStore.getState();
  return orderInfo.cliente.trim() !== "" || lines.length > 0;
}

export default function NewOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resetOrder = useOrderStore((state) => state.resetOrder);
  const setStep = useOrderStore((state) => state.setStep);
  const materials = useOrderStore((state) => state.materials);
  const setMaterials = useOrderStore((state) => state.setMaterials);
  const setOrderInfo = useOrderStore((state) => state.setOrderInfo);
  const setLines = useOrderStore((state) => state.setLines);
  const setSourceQuotationItems = useOrderStore((state) => state.setSourceQuotationItems);
  const pendingCliente = useOrderStore((state) => state.orderInfo.cliente);
  const pendingLines = useOrderStore((state) => state.lines);
  const [resumeOffer, setResumeOffer] = useState(false);
  useDropStaleBackGuard(resumeOffer);
  const [queryReady, setQueryReady] = useState(false);
  const [fromQuotationId, setFromQuotationId] = useState<string | null>(null);
  const [prefillState, setPrefillState] = useState<PrefillState>("idle");
  const [prefillError, setPrefillError] = useState<string | null>(null);

  // Si riparte dallo step 1 (un ordine nuovo ancora in corso si può prima riprendere). Deciso insieme alla lettura
  // della query, così il wizard con i dati vecchi non compare per un attimo prima della schermata "riprendi".
  useEffect(() => {
    const quotationId = new URLSearchParams(window.location.search).get("fromQuotationId");
    setFromQuotationId(quotationId);
    if (!quotationId) {
      if (hasResumableOrder()) {
        setResumeOffer(true);
      } else {
        resetOrder();
        setStep(1);
      }
    }
    setQueryReady(true);
  }, [resetOrder, setStep]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Load materials if not already loaded
  useEffect(() => {
    if (!queryReady) return;
    if (fromQuotationId) return;
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
  }, [fromQuotationId, materials.length, queryReady, setMaterials]);

  useEffect(() => {
    if (!queryReady) return;
    if (!fromQuotationId || loading || !user) return;

    let cancelled = false;
    const quotationId = fromQuotationId;

    async function prefillFromQuotation() {
      setPrefillState("loading");
      setPrefillError(null);
      resetOrder();

      try {
        const currentMaterials = useOrderStore.getState().materials;
        const [quotationRes, loadedMaterials] = await Promise.all([
          fetch(`/api/quotations/${encodeURIComponent(quotationId)}`, { cache: "no-store" }),
          currentMaterials.length > 0 ? Promise.resolve(currentMaterials) : fetchMaterials(),
        ]);

        if (!quotationRes.ok) throw new Error("Preventivo non trovato");

        const data = await quotationRes.json();
        const quotation = data.quotation as Quotation | undefined;
        if (!quotation) throw new Error("Preventivo non trovato");
        if (quotation.status === "in_approvazione") {
          throw new Error("Il preventivo è in attesa di approvazione di un amministratore e non può ancora essere trasformato in ordine.");
        }
        if (quotation.status === "rifiutato") {
          throw new Error("Il preventivo è stato rifiutato: correggi gli sconti e salvalo di nuovo prima di trasformarlo in ordine.");
        }
        if (quotation.status === "convertito") {
          throw new Error("Il preventivo è già stato trasformato in ordine.");
        }

        if (cancelled) return;

        if (loadedMaterials.length > 0) setMaterials(loadedMaterials);

        setOrderInfo({
          quotationId: quotation.id,
          clienteId: quotation.clienteId,
          cliente: quotation.cliente,
          note: quotation.note,
          magazzino: "",
          luogoConsegna: quotation.luogoConsegna ?? "",
          dataConsegna: quotation.dataConsegnaPrevista ?? "",
        });

        // Copia le righe del preventivo (ordine, note, manuali e trasporto inclusi)
        setLines(quotation.items);
        // Il preventivo è già approvato: righe scontate identiche non richiedono una seconda approvazione.
        setSourceQuotationItems(quotation.items);

        setStep(3);
        setPrefillState("ready");
      } catch (err) {
        if (cancelled) return;
        setPrefillError(err instanceof Error ? err.message : "Errore nel caricamento del preventivo");
        setPrefillState("error");
      }
    }

    prefillFromQuotation();

    return () => {
      cancelled = true;
    };
  }, [fromQuotationId, loading, queryReady, resetOrder, setLines, setMaterials, setOrderInfo, setSourceQuotationItems, setStep, user]);

  if (loading || !queryReady || !user) {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (fromQuotationId && prefillState !== "ready") {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background flex items-center justify-center px-4 py-6">
        {prefillState === "error" ? (
          <div className="max-w-sm w-full rounded-2xl border border-border bg-card p-5 flex flex-col gap-4 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Impossibile trasformare il preventivo</h1>
              <p className="mt-1 text-sm text-muted-foreground">{prefillError ?? "Preventivo non disponibile"}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="gap-2 sm:flex-1" onClick={() => router.push("/quotations")}>
                <ArrowLeft className="h-4 w-4" />
                Preventivi
              </Button>
              <Button className="gap-2 sm:flex-1" onClick={() => router.replace("/orders/new")}>
                <FileText className="h-4 w-4" />
                Nuovo ordine
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-9 w-9 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <div>
              <p className="font-semibold">Preparazione ordine...</p>
              <p className="text-sm text-muted-foreground">Sto copiando cliente e articoli dal preventivo.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (resumeOffer) {
    const articleCount = countArticleLines(pendingLines);
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background flex items-center justify-center px-4 py-6">
        <div className="max-w-sm w-full rounded-2xl border border-border bg-card p-5 flex flex-col gap-4 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Ordine in corso</h1>
            <p className="mt-1 text-sm text-muted-foreground wrap-break-word">
              Hai un ordine non completato
              {pendingCliente.trim() && <> per <strong className="text-foreground">{pendingCliente}</strong></>}
              {articleCount > 0 && ` (${articleCount} ${articleCount === 1 ? "articolo" : "articoli"})`}. Vuoi riprenderlo?
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="h-11 gap-2 sm:flex-1" onClick={() => setResumeOffer(false)}>
              <RotateCcw className="h-4 w-4" />
              Riprendi ordine
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-2 sm:flex-1"
              onClick={() => {
                resetOrder();
                setStep(1);
                setResumeOffer(false);
              }}
            >
              <FileText className="h-4 w-4" />
              Nuovo ordine
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Con «Nuovo ordine» quello in corso viene scartato.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <OrderWizard />
    </div>
  );
}
