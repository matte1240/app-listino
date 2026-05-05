"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrderStore } from "@/lib/useOrderStore";

interface ImportResponse {
  count: number;
  imported: number;
  updated: number;
  unchanged?: number;
}

export default function UploadExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const setMaterials = useOrderStore((s) => s.setMaterials);

  const handleFile = async (file: File) => {
    setError(null);
    setMessage(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/excel", { method: "POST", body: formData });
      const importData = (await res.json().catch(() => null)) as ImportResponse | { error?: string } | null;
      if (!res.ok) {
        setError(importData && "error" in importData && importData.error ? importData.error : "Errore nel caricamento del file.");
        return;
      }
      // Reload materials from DB (includes enriched descriptions)
      const matRes = await fetch("/api/materials");
      if (matRes.ok) {
        const data = await matRes.json();
        if (Array.isArray(data.materials)) {
          setMaterials(data.materials);
        }
      }
      const payload = importData as ImportResponse;
      const unchangedText = payload.unchanged ? `, ${payload.unchanged} invariati` : "";
      setFileName(file.name);
      setMessage(`${payload.count} materiali (${payload.imported} nuovi, ${payload.updated} aggiornati${unchangedText})`);
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
        className="gap-2 h-9 text-sm w-full justify-center sm:w-auto"
      >
        <Upload className="h-4 w-4 shrink-0" />
        {uploading ? "Caricamento…" : "Carica Excel"}
      </Button>
      {fileName && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground px-1">
          <FileSpreadsheet className="h-3 w-3 shrink-0" />
          {fileName}
        </p>
      )}
      {message && <p className="text-xs text-emerald-600 px-1">{message}</p>}
      {error && <p className="text-xs text-destructive px-1">{error}</p>}
    </div>
  );
}
