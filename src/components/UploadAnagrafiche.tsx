"use client";

import { useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UploadAnagrafiche() {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (importing) return;

    setImporting(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/anagrafiche/import", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { total?: number; imported?: number; updated?: number; error?: string }
        | null;

      if (!res.ok) {
        setError(data?.error ?? "Errore import anagrafiche");
        return;
      }

      const total = data?.total ?? 0;
      const imported = data?.imported ?? 0;
      const updated = data?.updated ?? 0;
      setMessage(`${total} anagrafiche importate (${imported} nuove, ${updated} aggiornate)`);
    } catch {
      setError("Errore durante l'import delle anagrafiche");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={importing}
        onClick={handleImport}
        className="gap-2 h-9 text-sm"
        title="Importa il file /public/ANAGRAFICHE.xlsx nel database"
      >
        {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4 shrink-0" />}
        {importing ? "Importazione…" : "Importa Anagrafiche"}
      </Button>
      {message && <p className="text-xs text-muted-foreground px-1">{message}</p>}
      {error && <p className="text-xs text-destructive px-1">{error}</p>}
    </div>
  );
}
