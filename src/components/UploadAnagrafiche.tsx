"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportResponse {
  total: number;
  imported: number;
  updated: number;
  unchanged?: number;
}

export default function UploadAnagrafiche() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/anagrafiche/import", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json().catch(() => null)) as ImportResponse | { error?: string } | null;
      if (!res.ok) {
        setError(data && "error" in data && data.error ? data.error : "Errore nel caricamento anagrafiche.");
        return;
      }

      const payload = data as ImportResponse;
      const unchangedText = payload.unchanged ? `, ${payload.unchanged} invariate` : "";
      setFileName(file.name);
      setMessage(`${payload.total} anagrafiche (${payload.imported} nuove, ${payload.updated} aggiornate${unchangedText})`);
    } catch {
      setError("Errore nella lettura del file. Assicurati che sia un file Excel valido.");
    } finally {
      setUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />

      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="gap-2 h-10 rounded-xl w-full justify-center sm:w-auto"
      >
        <Upload className="h-4 w-4" />
        {uploading ? "Importazione..." : "Carica anagrafiche"}
      </Button>

      {fileName && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileSpreadsheet className="h-3 w-3" />
          {fileName}
        </p>
      )}

      {message && <p className="text-xs text-emerald-600">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
