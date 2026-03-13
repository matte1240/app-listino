"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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

  // Load Excel: prefer server-saved file, fallback to sample
  useEffect(() => {
    if (materials.length > 0) return;
    const tryLoad = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("not found");
      const buffer = await res.arrayBuffer();
      const parsed = parseExcel(buffer);
      if (parsed.length > 0) setMaterials(parsed);
    };
    tryLoad("/api/excel").catch(() => tryLoad("/listino_esempio.xlsx")).catch(() => {});
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
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-15 flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/IVICOLORS_marchio.png"
              alt="IVI Colors"
              width={120}
              height={40}
              className="h-9 w-auto shrink-0 object-contain dark:hidden"
              priority
            />
            <Image
              src="/IVI_white_marchio.png"
              alt="IVI Colors"
              width={120}
              height={40}
              className="h-9 w-auto shrink-0 object-contain hidden dark:block"
              priority
            />
            <div className="min-w-0">
              <h1 className="font-extrabold text-base leading-tight truncate tracking-tight">
                Listino Materiali
              </h1>
              {materials.length > 0 && (
                <p className="text-xs text-muted-foreground leading-tight">
                  {materials.length.toLocaleString("it")} articoli
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* User chip */}
            <div className="hidden sm:flex items-center gap-1.5 bg-muted rounded-full px-2.5 py-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span className="font-semibold">{user?.username}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-2xl" onClick={logout} aria-label="Esci">
              <LogOut className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-2xl"
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
              className="gap-1.5 h-9 rounded-2xl font-semibold"
              aria-label="Apri riepilogo ordine"
            >
              <ShoppingCart className="h-4 w-4" />
              {flaggedCount > 0 ? (
                <span>{flaggedCount}</span>
              ) : (
                <span className="hidden sm:inline text-xs">Ordine</span>
              )}
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3 pt-2">
          <SearchBar />
        </div>
      </header>

      {/* Main scrollable content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        <MaterialList />
      </main>

      {/* Order drawer */}
      <OrderDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
