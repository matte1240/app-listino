"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, MessageSquarePlus, PackagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import DiscountSelector from "@/components/DiscountSelector";
import NumberField, { IOS_FONT } from "@/components/NumberField";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";
import type { LineActions } from "@/lib/order-lines-store";
import { MANUAL_LINE_UNITS } from "@/lib/order-lines";
import { cn } from "@/lib/utils";
import type { OrderLine } from "@/types";

/** Richiesta di apertura della casella: nuova riga (eventualmente precompilata/posizionata) o modifica di una riga esistente. */
export interface LineComposerRequest {
  kind: "manuale" | "nota";
  /** Riga esistente da modificare (manuale o nota). */
  line?: OrderLine;
  /** Descrizione iniziale per una nuova riga manuale (es. testo cercato senza risultati). */
  descrizione?: string;
  /** Per una nuova nota: id della riga sopra cui inserirla (assente = in coda). */
  beforeId?: string | null;
}

export interface QuickLineComposerHandle {
  open: (request: LineComposerRequest) => void;
}

interface Props {
  store: "order" | "quotation";
  /** Chiamato dopo l'inserimento di una riga (il wizard azzera la ricerca come dopo la conferma di un articolo). */
  onAdded?: () => void;
}

type Mode = "closed" | "manuale" | "nota";

interface ManualErrors {
  descrizione?: boolean;
  qty?: boolean;
}

const DEFAULT_UM = MANUAL_LINE_UNITS[0];

/** U.M. di una riga esistente nella forma del menu; un valore fuori elenco (righe salvate prima del menu) resta com'è. */
function resolveManualUnit(um: string): string {
  const value = um.trim();
  if (!value) return DEFAULT_UM;
  return MANUAL_LINE_UNITS.find((unit) => unit === value.toUpperCase()) ?? value;
}

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-2.5 text-sm font-semibold focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/12";

const invalidFieldClass = "border-destructive focus:border-destructive focus:ring-destructive/30";

function dismissKeyboard() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    active.blur();
  }
}

function FieldWarning({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-[11px] font-medium text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {children}
    </p>
  );
}

/**
 * Casella fissa sotto la barra di ricerca dello step Materiali:
 * inserisce (o modifica) righe manuali e note senza passare dal carrello.
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
  // La quantità non è precompilata: resta il placeholder finché l'utente non la digita.
  const [qty, setQty] = useState(0);
  const [sconto, setSconto] = useState(0);
  const [manualErrors, setManualErrors] = useState<ManualErrors>({});
  const [nota, setNota] = useState("");
  /** Riga in modifica (null = inserimento). */
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [noteBeforeId, setNoteBeforeId] = useState<string | null>(null);
  const descrizioneRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const resetManual = () => {
    setDescrizione("");
    setUm(DEFAULT_UM);
    setPrezzo(0);
    setQty(0);
    setSconto(0);
    setManualErrors({});
  };

  const openManual = (initial = "", line: OrderLine | null = null) => {
    resetManual();
    if (line) {
      setDescrizione(line.descrizione);
      setUm(resolveManualUnit(line.um));
      setPrezzo(line.prezzoListino);
      setQty(line.qty);
      setSconto(line.sconto ?? 0);
    } else {
      setDescrizione(initial);
    }
    setEditingLine(line);
    setMode("manuale");
  };

  const openNote = (line: OrderLine | null = null, beforeId: string | null = null) => {
    setNota(line?.descrizione ?? "");
    setEditingLine(line);
    setNoteBeforeId(line ? null : beforeId);
    setMode("nota");
  };

  const open = (request: LineComposerRequest) => {
    if (request.kind === "manuale") openManual(request.descrizione ?? "", request.line ?? null);
    else openNote(request.line ?? null, request.beforeId ?? null);
  };

  useImperativeHandle(ref, () => ({ open }));

  const close = () => {
    dismissKeyboard();
    setMode("closed");
    setEditingLine(null);
    setNoteBeforeId(null);
    setManualErrors({});
  };

  const isEditing = editingLine !== null;
  const canAddNote = nota.trim() !== "";

  const addManual = () => {
    // Avviso sui campi mancanti invece di un pulsante disabilitato: l'utente vede subito cosa manca.
    const errors: ManualErrors = { descrizione: descrizione.trim() === "", qty: !(qty > 0) };
    if (errors.descrizione || errors.qty) {
      setManualErrors(errors);
      (errors.descrizione ? descrizioneRef : qtyRef).current?.focus();
      return;
    }
    const patch = { descrizione: descrizione.trim(), um: um.trim(), qty, prezzoListino: prezzo, sconto };
    if (editingLine) {
      actions.updateLine(editingLine.id, patch);
      toast.success("Articolo manuale aggiornato");
    } else {
      actions.addManualLine(null, patch);
      toast.success("Articolo manuale aggiunto");
    }
    close();
    resetManual();
    onAdded?.();
  };

  const addNote = () => {
    if (!canAddNote) return;
    if (editingLine) {
      actions.updateLine(editingLine.id, { descrizione: nota.trim() });
      toast.success("Nota aggiornata");
    } else {
      actions.addCommentLine(noteBeforeId, nota.trim());
      toast.success("Nota aggiunta");
    }
    close();
    setNota("");
    onAdded?.();
  };

  const tabClass = (active: boolean) =>
    cn(
      "flex-1 h-11 rounded-full border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors sm:flex-none sm:px-4",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card border-input text-foreground/75 hover:text-foreground hover:border-primary/50"
    );

  return (
    <div
      data-testid="quick-line-composer"
      data-composer-open={mode === "closed" ? undefined : ""}
      className={cn(
        "flex flex-col gap-3 rounded-2xl transition-all",
        mode === "closed" ? "" : "border border-primary bg-card p-3 ring-4 ring-primary/10"
      )}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => (mode === "manuale" ? close() : openManual())} className={tabClass(mode === "manuale")} aria-pressed={mode === "manuale"}>
          <PackagePlus className="h-4 w-4" />
          {isEditing && mode === "manuale" ? "Modifica articolo manuale" : "Articolo manuale"}
        </button>
        <button type="button" onClick={() => (mode === "nota" ? close() : openNote())} className={tabClass(mode === "nota")} aria-pressed={mode === "nota"}>
          <MessageSquarePlus className="h-4 w-4" />
          {isEditing && mode === "nota" ? "Modifica nota" : "Nota"}
        </button>
      </div>

      {mode === "manuale" && (
        <form
          noValidate
          className="@container flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addManual();
          }}
        >
          {/* Con spazio (tablet, desktop) descrizione e campi numerici su una riga, sconto e pulsanti sulla successiva:
              la casella sticky resta bassa e lascia visibili listino e carrello. */}
          <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-start">
            <div className="flex min-w-0 flex-col gap-1 @2xl:flex-[2] @2xl:gap-0.5">
              <span className="hidden text-[10px] uppercase tracking-wide text-muted-foreground @2xl:block">Descrizione</span>
              <input
                ref={descrizioneRef}
                type="text"
                value={descrizione}
                placeholder="Descrizione articolo"
                aria-label="Descrizione articolo manuale"
                aria-invalid={manualErrors.descrizione || undefined}
                autoFocus
                autoComplete="off"
                onChange={(event) => {
                  setDescrizione(event.target.value);
                  if (event.target.value.trim()) setManualErrors((current) => (current.descrizione ? { ...current, descrizione: false } : current));
                }}
                className={cn(fieldClass, "h-10 font-medium", manualErrors.descrizione && invalidFieldClass)}
                style={IOS_FONT}
              />
              {manualErrors.descrizione && <FieldWarning>Inserisci la descrizione dell&apos;articolo.</FieldWarning>}
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-2 @2xl:flex-[3]">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">U.M.</span>
                <select
                  value={um}
                  aria-label="Unità di misura"
                  onChange={(event) => setUm(event.target.value)}
                  className={fieldClass}
                  style={IOS_FONT}
                >
                  {MANUAL_LINE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                  {!MANUAL_LINE_UNITS.includes(um) && <option value={um}>{um}</option>}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Qtà</span>
                <NumberField
                  ref={qtyRef}
                  value={qty}
                  onCommit={(value) => {
                    setQty(value);
                    if (value > 0) setManualErrors((current) => (current.qty ? { ...current, qty: false } : current));
                  }}
                  placeholder="0"
                  ariaLabel="Quantità"
                  className="h-10 w-full"
                  onEnter={addManual}
                  invalid={!!manualErrors.qty}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Prezzo €</span>
                <NumberField value={prezzo} onCommit={setPrezzo} placeholder="0,00" ariaLabel="Prezzo unitario" className="h-10 w-full" onEnter={addManual} />
              </label>
            </div>
          </div>
          {manualErrors.qty && <FieldWarning>Inserisci la quantità.</FieldWarning>}
          <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-start @2xl:justify-between">
            <div className="flex items-start gap-2">
              <span className="flex h-10 shrink-0 items-center text-[10px] uppercase tracking-wide text-muted-foreground">Sconto</span>
              <DiscountSelector size="md" value={sconto} onChange={setSconto} onInteract={dismissKeyboard} />
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5 @2xl:pt-0">
              <button
                type="submit"
                className="flex-1 sm:flex-none h-11 px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover transition-colors"
              >
                {isEditing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {isEditing ? "Salva modifica" : "Aggiungi"}
              </button>
              <button
                type="button"
                onClick={close}
                className="h-11 px-4 rounded-lg text-sm font-semibold border border-input bg-card text-foreground/75 hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
              >
                <X className="h-4 w-4" />
                Annulla
              </button>
            </div>
          </div>
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
            className="w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm italic resize-y min-h-[3rem] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/12"
            style={IOS_FONT}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canAddNote}
              className="flex-1 sm:flex-none h-11 px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed transition-colors"
            >
              {isEditing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isEditing ? "Salva modifica" : "Aggiungi nota"}
            </button>
            <button
              type="button"
              onClick={close}
              className="h-11 px-4 rounded-lg text-sm font-semibold border border-input bg-card text-foreground/75 hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
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
