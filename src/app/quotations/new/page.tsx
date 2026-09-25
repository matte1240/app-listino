"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuotationWizard, { QUOTATION_WIZARD_ORIGIN_KEY } from "@/components/QuotationWizard";
import { useDropStaleBackGuard } from "@/components/WizardStepper";
import { useAuth } from "@/lib/auth-context";
import { countArticleLines } from "@/lib/order-lines";
import { useQuotationStore } from "@/lib/useQuotationStore";

/** Nuovo preventivo lasciato a metà (ricarica, scheda chiusa o sospesa dal tablet) ancora nello store persistito. */
function hasResumableQuotation(): boolean {
  try {
    if (localStorage.getItem(QUOTATION_WIZARD_ORIGIN_KEY) !== "new") return false;
  } catch {
    return false;
  }
  const { quotationInfo, lines } = useQuotationStore.getState();
  return quotationInfo.cliente.trim() !== "" || lines.length > 0;
}

export default function NewQuotationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resetQuotation = useQuotationStore((s) => s.resetQuotation);
  const setStep = useQuotationStore((s) => s.setStep);
  const materials = useQuotationStore((s) => s.materials);
  const setMaterials = useQuotationStore((s) => s.setMaterials);
  const pendingCliente = useQuotationStore((s) => s.quotationInfo.cliente);
  const pendingLines = useQuotationStore((s) => s.lines);
  /** "checking": si decide se proporre di riprendere il preventivo in corso prima di mostrare il wizard. */
  const [view, setView] = useState<"checking" | "resume" | "wizard">("checking");
  useDropStaleBackGuard(view === "resume");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Si riparte dallo step 1 (un preventivo nuovo ancora in corso si può prima riprendere)
  useEffect(() => {
    if (hasResumableQuotation()) {
      setView("resume");
      return;
    }
    resetQuotation();
    setStep(1);
    setView("wizard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !user || view === "checking") {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (view === "resume") {
    const articleCount = countArticleLines(pendingLines);
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background flex items-center justify-center px-4 py-6">
        <div className="max-w-sm w-full rounded-2xl border border-border bg-card p-5 flex flex-col gap-4 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Preventivo in corso</h1>
            <p className="mt-1 text-sm text-muted-foreground wrap-break-word">
              Hai un preventivo non salvato
              {pendingCliente.trim() && <> per <strong className="text-foreground">{pendingCliente}</strong></>}
              {articleCount > 0 && ` (${articleCount} ${articleCount === 1 ? "articolo" : "articoli"})`}. Vuoi riprenderlo?
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="h-11 gap-2" onClick={() => setView("wizard")}>
              <RotateCcw className="h-4 w-4" />
              Riprendi preventivo
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-2"
              onClick={() => {
                resetQuotation();
                setStep(1);
                setView("wizard");
              }}
            >
              <FileText className="h-4 w-4" />
              Nuovo preventivo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Con «Nuovo preventivo» quello in corso viene scartato.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <QuotationWizard />
    </div>
  );
}
