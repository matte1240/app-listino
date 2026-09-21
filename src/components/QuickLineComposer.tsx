"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, PackagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import DiscountSelector from "@/components/DiscountSelector";
import NumberField, { IOS_FONT } from "@/components/NumberField";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";
import type { LineActions } from "@/lib/order-lines-store";
import { cn } from "@/lib/utils";

export interface QuickLineComposerHandle {
  /** Apre il form della riga manuale, con la descrizione già compilata (es. testo cercato senza risultati). */
  openManual: (descrizione?: string) => void;
  openNote: () => void;
}

interface Props {
  store: "order" | "quotation";
  /** Chiamato dopo l'inserimento di una riga (il wizard azzera la ricerca come dopo la conferma di un articolo). */
  onAdded?: () => void;
}

type Mode = "closed" | "manuale" | "nota";

const DEFAULT_UM = "pz";

const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-semibold focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40";

function dismissKeyboard() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    active.blur();
  }
}

/**
 * Casella "pinnata" in cima alla lista articoli dello step Materiali:
 * inserisce righe manuali e note senza passare dal carrello.
 */
const QuickLineComposer = forwardRef<QuickLineComposerHandle, Props>(function QuickLineComposer({ store, onAdded }, ref) {
  // Le azioni sono funzioni stabili: leggerle una volta evita ri-render su ogni modifica dello store.
  const actions: LineActions = useMemo(
    () => (store === "quotation" ? useQuotationStore.getState() : useOrderStore.getState()),
    [store]
  );

  const [mode, setMode] = useState<Mode>("closed");
  const [descrizione, setDescrizione] = useState("");
  const [um, setUm] = useState(DEFAULT_UM);
  const [prezzo, setPrezzo] = useState(0);
  const [qty, setQty] = useState(1);
  const [sconto, setSconto] = useState(0);
  const [nota, setNota] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const resetManual = () => {
    setDescrizione("");
    setUm(DEFAULT_UM);
    setPrezzo(0);
    setQty(1);
    setSconto(0);
  };

  const openManual = (initial = "") => {
    resetManual();
    setDescrizione(initial);
    setMode("manuale");
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const openNote = () => {
    setNota("");
    setMode("nota");
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  useImperativeHandle(ref, () => ({ openManual, openNote }));

  const close = () => {
    dismissKeyboard();
    setMode("closed");
  };

  const canAddManual = descrizione.trim() !== "" && qty > 0;
  const canAddNote = nota.trim() !== "";

  const addManual = () => {
    if (!canAddManual) return;
    actions.addManualLine(null, {
      descrizione: descrizione.trim(),
      um: um.trim(),
      qty,
      prezzoListino: prezzo,
      sconto,
    });
    toast.success("Articolo manuale aggiunto");
    close();
    resetManual();
    onAdded?.();
  };

  const addNote = () => {
    if (!canAddNote) return;
    actions.addCommentLine(null, nota.trim());
    toast.success("Nota aggiunta");
    close();
    setNota("");
    onAdded?.();
  };

  const tabClass = (active: boolean) =>
    cn(
      "flex-1 h-10 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
    );

  return (
    <div
      ref={rootRef}
      data-testid="quick-line-composer"
      className={cn(
        "rounded-2xl border bg-card shadow-sm p-2.5 flex flex-col gap-2.5 scroll-mt-32",
        mode === "closed" ? "border-border" : "border-primary/40 shadow-md shadow-primary/10"
      )}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => (mode === "manuale" ? close() : openManual(descrizione))} className={tabClass(mode === "manuale")} aria-pressed={mode === "manuale"}>
          <PackagePlus className="h-4 w-4" />
          Articolo manuale
        </button>
        <button type="button" onClick={() => (mode === "nota" ? close() : openNote())} className={tabClass(mode === "nota")} aria-pressed={mode === "nota"}>
          <MessageSquarePlus className="h-4 w-4" />
          Nota
        </button>
      </div>

      {mode === "manuale" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addManual();
          }}
        >
          <input
            type="text"
            value={descrizione}
            placeholder="Descrizione articolo"
            aria-label="Descrizione articolo manuale"
            autoFocus
            autoComplete="off"
            onChange={(event) => setDescrizione(event.target.value)}
            className={cn(fieldClass, "h-10 font-medium")}
            style={IOS_FONT}
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">U.M.</span>
              <input
                type="text"
                value={um}
                placeholder="pz"
                aria-label="Unità di misura"
                autoComplete="off"
                onChange={(event) => setUm(event.target.value)}
                className={fieldClass}
                style={IOS_FONT}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Prezzo €</span>
              <NumberField value={prezzo} onCommit={setPrezzo} placeholder="0,00" ariaLabel="Prezzo unitario" className="w-full" onEnter={addManual} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Qtà</span>
              <NumberField value={qty} onCommit={setQty} placeholder="0" ariaLabel="Quantità" className="w-full" onEnter={addManual} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Sconto</span>
            <DiscountSelector size="sm" value={sconto} onChange={setSconto} onInteract={dismissKeyboard} />
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="submit"
              disabled={!canAddManual}
              className="flex-1 sm:flex-none h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground border border-primary hover:opacity-95 disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
              Aggiungi
            </button>
            <button
              type="button"
              onClick={close}
              className="h-10 px-4 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
            >
              <X className="h-4 w-4" />
              Annulla
            </button>
          </div>
          {!canAddManual && (
            <p className="text-[11px] text-muted-foreground">Servono descrizione e quantità; il prezzo può restare 0.</p>
          )}
        </form>
      )}

      {mode === "nota" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addNote();
          }}
        >
          <textarea
            value={nota}
            placeholder="Scrivi una nota (es. titolo di un gruppo di articoli)"
            aria-label="Testo della nota"
            autoFocus
            rows={2}
            onChange={(event) => setNota(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                addNote();
              }
            }}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm italic resize-y min-h-[3rem] focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40"
            style={IOS_FONT}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canAddNote}
              className="flex-1 sm:flex-none h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground border border-primary hover:opacity-95 disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
              Aggiungi nota
            </button>
            <button
              type="button"
              onClick={close}
              className="h-10 px-4 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
            >
              <X className="h-4 w-4" />
              Annulla
            </button>
          </div>
        </form>
      )}
    </div>
  );
});

export default QuickLineComposer;
