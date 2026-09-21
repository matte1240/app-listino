"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import QuotationWizard from "@/components/QuotationWizard";
import { useAuth } from "@/lib/auth-context";
import { useQuotationStore } from "@/lib/useQuotationStore";

export default function NewQuotationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resetQuotation = useQuotationStore((s) => s.resetQuotation);
  const setStep = useQuotationStore((s) => s.setStep);
  const materials = useQuotationStore((s) => s.materials);
  const setMaterials = useQuotationStore((s) => s.setMaterials);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    resetQuotation();
    setStep(1);
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

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <QuotationWizard />
    </div>
  );
}