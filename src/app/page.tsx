"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, LogOut, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchBar from "@/components/SearchBar";
import UploadExcel from "@/components/UploadExcel";
import MaterialList from "@/components/MaterialList";
import OrderDrawer from "@/components/OrderDrawer";
import { useOrderStore } from "@/lib/useOrderStore";
import { parseExcel } from "@/lib/excel";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

export default function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const materials = useOrderStore((s) => s.materials);
  const orderItems = useOrderStore((s) => s.orderItems);
  const setMaterials = useOrderStore((s) => s.setMaterials);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const flaggedCount = Object.values(orderItems).filter((o) => o.flagged).length;

  // Load sample Excel on first visit (when no materials are loaded)
  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/listino_esempio.xlsx")
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        const parsed = parseExcel(buffer);
        if (parsed.length > 0) setMaterials(parsed);
      })
      .catch(() => {
        // silently fail — user can upload manually
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight truncate text-foreground">
                Listino Materiali
              </h1>
              {materials.length > 0 && (
                <p className="text-xs text-muted-foreground leading-tight">
                  {materials.length} articoli
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => router.push("/admin/users")}
                aria-label="Gestione utenti"
              >
                <Users className="h-4 w-4" />
              </Button>
            )}
            {isAdmin && <UploadExcel />}
            <Button
              variant={flaggedCount > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setDrawerOpen(true)}
              className="gap-1.5 h-9 rounded-xl"
              aria-label="Apri riepilogo ordine"
            >
              <ShoppingCart className="h-4 w-4" />
              {flaggedCount > 0 ? (
                <span className="font-semibold">{flaggedCount}</span>
              ) : (
                <span className="hidden sm:inline text-xs">Ordine</span>
              )}
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <SearchBar />
        </div>
      </header>

      {/* User bar */}
      <div className="max-w-2xl mx-auto w-full px-4 py-2 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span className="font-medium">{user?.username}</span>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{user?.role}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5 h-7 text-xs">
          <LogOut className="h-3.5 w-3.5" />
          Esci
        </Button>
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
