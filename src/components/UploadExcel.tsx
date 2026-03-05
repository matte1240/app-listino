"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseExcel } from "@/lib/excel";
import { useOrderStore } from "@/lib/useOrderStore";

export default function UploadExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setMaterials = useOrderStore((s) => s.setMaterials);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const materials = parseExcel(buffer);
      if (materials.length === 0) {
        setError("Nessun articolo trovato. Verifica le intestazioni del file.");
        return;
      }
      setMaterials(materials);
      setFileName(file.name);
    } catch {
      setError("Errore nella lettura del file. Assicurati che sia un .xlsx valido.");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so same file can be re-uploaded
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
        onClick={() => inputRef.current?.click()}
        className="gap-2 h-9 text-sm"
      >
        <Upload className="h-4 w-4 shrink-0" />
        Carica Excel
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
