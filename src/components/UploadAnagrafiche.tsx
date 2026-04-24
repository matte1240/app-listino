"use client";

import { useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UploadAnagrafiche() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setMessage(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/anagrafiche/import", { method: "POST", body: formData });
      const data = await res.json().catch(() => null) as {
        total?: number; imported?: number; updated?: number; error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Errore nel caricamento del file.");
        return;
      }
      setFileName(file.name);
      const total = data?.total ?? 0;
      const imported = data?.imported ?? 0;
      const updated = data?.updated ?? 0;
      setMessage(`${total} anagrafiche (${imported} nuove, ${updated} aggiornate)`);
    } catch {
      setError("Errore nella lettura del file. Assicurati che sia un .xlsx valido.");
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="gap-2 h-9 text-sm"
      >
        <Building2 className="h-4 w-4 shrink-0" />
        {uploading ? "Importazione…" : "Carica Anagrafiche"}
      </Button>
      {fileName && message && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground px-1">{message}</p>
      )}
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
    </div>
  );
}
