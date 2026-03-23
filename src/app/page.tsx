"use client";

import { useEffect } from "react";
import SearchBar from "@/components/SearchBar";
import MaterialList from "@/components/MaterialList";
import OrderDrawer from "@/components/OrderDrawer";
import { useOrderStore } from "@/lib/useOrderStore";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const drawerOpen = useOrderStore((s) => s.drawerOpen);
  const setDrawerOpen = useOrderStore((s) => s.setDrawerOpen);
  const materials = useOrderStore((s) => s.materials);
  const setMaterials = useOrderStore((s) => s.setMaterials);
  const { loading } = useAuth();

  // Load materials from DB (server-side, already enriched)
  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open drawer when returning from edit flow
  useEffect(() => {
    if (sessionStorage.getItem("editingOrderId")) {
      setDrawerOpen(true);
    }
  }, [setDrawerOpen]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Search strip */}
      <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <SearchBar />
        </div>
      </div>

      {/* Main scrollable content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        <MaterialList />
      </main>

      {/* Order drawer */}
      <OrderDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
