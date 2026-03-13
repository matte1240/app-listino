"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrderStore } from "@/lib/useOrderStore";

export default function UploadExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const setMaterials = useOrderStore((s) => s.setMaterials);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/excel", { method: "POST", body: formData });
      if (!res.ok) {
        setError("Errore nel caricamento del file.");
        return;
      }
      // Reload materials from DB (includes enriched descriptions)
      const matRes = await fetch("/api/materials");
      if (matRes.ok) {
        const data = await matRes.json();
        if (data.materials?.length) {
          setMaterials(data.materials);
          setFileName(file.name);
        }
      }
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
        <Upload className="h-4 w-4 shrink-0" />
        {uploading ? "Caricamento…" : "Carica Excel"}
      </Button>
      {fileName && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground px-1">
          <FileSpreadsheet className="h-3 w-3 shrink-0" />
          {fileName}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
    </div>
  );
}
