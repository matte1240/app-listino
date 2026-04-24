"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import UploadAnagrafiche from "@/components/UploadAnagrafiche";
import { useAuth } from "@/lib/auth-context";

export default function AdminAnagrafichePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-5">
        <h1 className="font-bold text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Anagrafiche clienti
        </h1>

        <div className="rounded-2xl border bg-card p-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Carica il file anagrafiche clienti in formato Excel. Le righe esistenti vengono aggiornate
            usando la chiave combinata <strong>Codice + Partita IVA</strong>.
          </p>
          <UploadAnagrafiche />
          <p className="text-xs text-muted-foreground">
            Colonne obbligatorie: <strong>Codice</strong> e <strong>Ragione Sociale</strong>.
          </p>
        </div>
      </main>
    </div>
  );
}
