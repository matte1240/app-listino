"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import OrderWizard from "@/components/OrderWizard";

export default function NewOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resetOrder = useOrderStore((s) => s.resetOrder);
  const setStep = useOrderStore((s) => s.setStep);
  const materials = useOrderStore((s) => s.materials);
  const setMaterials = useOrderStore((s) => s.setMaterials);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Reset and start from step 1 when landing on this page fresh
  useEffect(() => {
    resetOrder();
    setStep(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load materials if not already loaded
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
      <OrderWizard />
    </div>
  );
}
