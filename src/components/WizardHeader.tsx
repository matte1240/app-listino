"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Sezione di provenienza (es. "Ordini"), mostrata come sovratitolo. */
  eyebrow: string;
  title: string;
  /** Cliente del documento in compilazione. */
  subtitle?: string;
  onExit: () => void;
}

/** Intestazione dei wizard ordine/preventivo, nello stesso stile dei titoli di pagina. */
export default function WizardHeader({ eyebrow, title, subtitle, onExit }: Props) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0 px-1">
        <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{eyebrow}</p>
        <h1 className="font-display text-[28px] leading-[1.1] font-bold text-foreground lg:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 line-clamp-2 text-sm font-medium wrap-break-word text-muted-foreground">{subtitle}</p>}
      </div>
      <Button variant="outline" onClick={onExit} className="shrink-0">
        <X />
        Esci
      </Button>
    </div>
  );
}
