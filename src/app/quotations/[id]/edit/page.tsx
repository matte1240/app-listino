"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QuotationWizard from "@/components/QuotationWizard";
import { useAuth } from "@/lib/auth-context";
import { useQuotationStore } from "@/lib/useQuotationStore";
import type { Quotation } from "@/types";

export default function EditQuotationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const materials = useQuotationStore((s) => s.materials);
  const setMaterials = useQuotationStore((s) => s.setMaterials);
  const resetQuotation = useQuotationStore((s) => s.resetQuotation);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    setFetchLoading(true);
    resetQuotation();
    fetch(`/api/quotations/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Preventivo non trovato");
        return res.json();
      })
      .then((data) => setQuotation(data.quotation as Quotation))
      .catch((err) => setError(err.message))
      .finally(() => setFetchLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  if (authLoading || fetchLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-destructive">{error ?? "Preventivo non trovato"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <QuotationWizard editingQuotation={quotation} />
    </div>
  );
}