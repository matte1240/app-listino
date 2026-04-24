"use client";

import { useEffect } from "react";
import SearchBar from "@/components/SearchBar";
import MaterialList from "@/components/MaterialList";
import { useOrderStore } from "@/lib/useOrderStore";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const materials = useOrderStore((s) => s.materials);
  const setMaterials = useOrderStore((s) => s.setMaterials);
  const { loading } = useAuth();

  // Load materials if not yet loaded
  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.materials?.length) setMaterials(data.materials); })
      .catch(() => {});
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
      {/* Search strip */}
      <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <SearchBar />
        </div>
      </div>

      {/* Main scrollable content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        <MaterialList isReadOnlyCatalog={true} />
      </main>

    </div>
  );
}
