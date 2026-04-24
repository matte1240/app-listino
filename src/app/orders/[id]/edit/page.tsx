"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import OrderWizard from "@/components/OrderWizard";
import type { Order } from "@/types";

export default function EditOrderPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const materials = useOrderStore((s) => s.materials);
  const setMaterials = useOrderStore((s) => s.setMaterials);
  const resetOrder = useOrderStore((s) => s.resetOrder);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Load materials if not already loaded
  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the order to edit
  useEffect(() => {
    if (!params?.id) return;
    setFetchLoading(true);
    resetOrder();
    fetch(`/api/orders/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Ordine non trovato");
        return res.json();
      })
      .then((data) => setOrder(data.order as Order))
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

  if (error || !order) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-destructive">{error ?? "Ordine non trovato"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <OrderWizard editingOrder={order} />
    </div>
  );
}
