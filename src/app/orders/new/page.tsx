"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import OrderWizard from "@/components/OrderWizard";
import type { Material, Quotation } from "@/types";

type PrefillState = "idle" | "loading" | "ready" | "error";

function normalizeSconto(value: number | undefined): 0 | 8 | 15 {
  return value === 8 || value === 15 ? value : 0;
}

async function fetchMaterials(): Promise<Material[]> {
  const res = await fetch("/api/materials");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.materials) ? data.materials : [];
}

export default function NewOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resetOrder = useOrderStore((state) => state.resetOrder);
  const setStep = useOrderStore((state) => state.setStep);
  const materials = useOrderStore((state) => state.materials);
  const setMaterials = useOrderStore((state) => state.setMaterials);
  const setOrderInfo = useOrderStore((state) => state.setOrderInfo);
  const setQty = useOrderStore((state) => state.setQty);
  const setSconto = useOrderStore((state) => state.setSconto);
  const [queryReady, setQueryReady] = useState(false);
  const [fromQuotationId, setFromQuotationId] = useState<string | null>(null);
  const [prefillState, setPrefillState] = useState<PrefillState>("idle");
  const [prefillError, setPrefillError] = useState<string | null>(null);

  useEffect(() => {
    setFromQuotationId(new URLSearchParams(window.location.search).get("fromQuotationId"));
    setQueryReady(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Reset and start from step 1 when landing on this page fresh
  useEffect(() => {
    if (!queryReady) return;
    if (fromQuotationId) return;
    resetOrder();
    setStep(1);
  }, [fromQuotationId, queryReady, resetOrder, setStep]);

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

        if (cancelled) return;

        if (loadedMaterials.length > 0) setMaterials(loadedMaterials);

        setOrderInfo({
          clienteId: quotation.clienteId,
          cliente: quotation.cliente,
          note: quotation.note,
          magazzino: "",
          luogoConsegna: "",
          dataConsegna: quotation.dataConsegnaPrevista ?? "",
        });

        for (const item of quotation.items) {
          setQty(item.codice, item.qty);
          setSconto(item.codice, normalizeSconto(item.sconto));
        }

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
  }, [fromQuotationId, loading, queryReady, resetOrder, setMaterials, setOrderInfo, setQty, setSconto, setStep, user]);

  if (loading || !queryReady || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (fromQuotationId && prefillState !== "ready") {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-4">
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

  return (
    <div className="min-h-dvh bg-background">
      <OrderWizard />
    </div>
  );
}
