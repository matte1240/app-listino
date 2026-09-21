"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, MessageSquare, MessageSquarePlus, PackagePlus, Truck, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import DiscountSelector from "@/components/DiscountSelector";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";
import { getTrasportoLine, isTrasportoLine } from "@/lib/order-lines";
import type { LineActions } from "@/lib/order-lines-store";
import { formatOrderCurrency, formatSconto, getDiscountedUnitPrice, getLineTotal } from "@/lib/order-totals";
import { cn, parseLocalizedNumber } from "@/lib/utils";
import type { OrderLine } from "@/types";

type EditorMode = "cart" | "summary";

interface Props {
  store: "order" | "quotation";
  /** "cart": righe compatte (sidebar/drawer dello step Materiali); "summary": righe con prezzi (riepilogo). */
  mode: EditorMode;
  /** Apre l'articolo nel catalogo per modificare quantità/sconto. */
  onEditArticle?: (codice: string) => void;
  /** Mostra il blocco "Spese di trasporto" con checkbox e importo. */
  showTrasportoControl?: boolean;
  /** Altezza massima dell'elenco (classe Tailwind), con scroll interno. */
  listHeightClass?: string;
}

const IOS_FONT = { fontSize: "16px" } as const;

function formatNumberInput(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return value.toLocaleString("it-IT", { maximumFractionDigits: 3, useGrouping: false });
}

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  autoFocus?: boolean;
}

/** Campo numerico con virgola decimale: aggiorna lo store ad ogni digitazione, riformatta al blur. */
function NumberField({ value, onCommit, placeholder, className, ariaLabel, autoFocus }: NumberFieldProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  // Mentre il campo è attivo mostra il testo digitato (es. "12,"), altrimenti il valore formattato dello store.
  const displayValue = focused ? text : formatNumberInput(value);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onFocus={() => {
        setText(formatNumberInput(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value);
        onCommit(Math.max(0, parseLocalizedNumber(event.target.value)));
      }}
      className={cn(
        "h-9 rounded-lg border border-border bg-background px-2 text-sm font-semibold text-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40",
        className
      )}
      style={IOS_FONT}
    />
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-7 w-7 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
        destructive
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
      )}
    >
      {children}
    </button>
  );
}

interface RowProps {
  line: OrderLine;
  index: number;
  count: number;
  mode: EditorMode;
  actions: LineActions;
  onEditArticle?: (codice: string) => void;
  autoFocus: boolean;
}

function ArticleRowContent({ line, mode, onEditArticle }: Pick<RowProps, "line" | "mode" | "onEditArticle">) {
  const sconto = line.sconto ?? 0;
  return (
    <>
      <p className="text-[11px] font-bold font-mono truncate">{line.codice}</p>
      <p className="text-[11px] text-muted-foreground truncate">{line.descrizione}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="font-semibold text-foreground">{line.qty} {line.um}</span>
        {sconto > 0 && <span className="font-semibold text-primary">-{formatSconto(sconto)}%</span>}
        {mode === "summary" && (
          sconto > 0 ? (
            <span className="flex items-center gap-1">
              <span className="line-through text-muted-foreground/50">€{line.prezzoListino.toFixed(3)}</span>
              <span className="font-semibold text-primary">€{getDiscountedUnitPrice(line).toFixed(3)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/70">€{line.prezzoListino.toFixed(3)}</span>
          )
        )}
        {mode === "summary" && <span className="ml-auto font-semibold text-foreground">{formatOrderCurrency(getLineTotal(line))}</span>}
        {onEditArticle && (
          <button
            type="button"
            onClick={() => onEditArticle(line.codice)}
            className="h-6 px-2 rounded-md border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Modifica
          </button>
        )}
      </div>
    </>
  );
}

function ManualRowContent({ line, mode, actions, autoFocus }: Pick<RowProps, "line" | "mode" | "actions" | "autoFocus">) {
  const sconto = line.sconto ?? 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Manuale</span>
        {mode === "summary" && <span className="ml-auto text-[11px] font-semibold text-foreground">{formatOrderCurrency(getLineTotal(line))}</span>}
      </div>
      <input
        type="text"
        value={line.descrizione}
        placeholder="Descrizione articolo"
        aria-label="Descrizione articolo manuale"
        autoFocus={autoFocus}
        onChange={(event) => actions.updateLine(line.id, { descrizione: event.target.value })}
        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-medium focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40"
        style={IOS_FONT}
      />
      <div className="grid grid-cols-3 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">U.M.</span>
          <input
            type="text"
            value={line.um}
            placeholder="pz"
            aria-label="Unità di misura"
            onChange={(event) => actions.updateLine(line.id, { um: event.target.value })}
            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-semibold focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40"
            style={IOS_FONT}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Prezzo €</span>
          <NumberField
            value={line.prezzoListino}
            onCommit={(value) => actions.updateLine(line.id, { prezzoListino: value })}
            placeholder="0,00"
            ariaLabel="Prezzo unitario"
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Qtà</span>
          <NumberField
            value={line.qty}
            onCommit={(value) => actions.updateLine(line.id, { qty: value })}
            placeholder="0"
            ariaLabel="Quantità"
            className="w-full"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Sconto</span>
        <DiscountSelector size="sm" value={sconto} onChange={(value) => actions.updateLine(line.id, { sconto: value })} />
      </div>
      {(line.qty <= 0 || !line.descrizione.trim()) && (
        <p className="text-[10px] text-amber-700">Inserisci descrizione e quantità per salvare questa riga.</p>
      )}
    </div>
  );
}

function CommentRowContent({ line, actions, autoFocus }: Pick<RowProps, "line" | "actions" | "autoFocus">) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="h-3 w-3" /> Nota
      </span>
      <textarea
        value={line.descrizione}
        placeholder="Scrivi una nota (es. titolo di un gruppo di articoli)"
        aria-label="Testo della nota"
        autoFocus={autoFocus}
        rows={2}
        onChange={(event) => actions.updateLine(line.id, { descrizione: event.target.value })}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm italic resize-y min-h-[2.5rem] focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40"
        style={IOS_FONT}
      />
      {!line.descrizione.trim() && (
        <p className="text-[10px] text-amber-700">Le note vuote non vengono salvate.</p>
      )}
    </div>
  );
}

function SortableLineRow({ line, index, count, mode, actions, onEditArticle, autoFocus }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: line.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isComment = line.tipo === "commento";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-background",
        isComment ? "border-dashed border-border bg-muted/30" : "border-border/70",
        isDragging && "relative z-10 opacity-80 shadow-lg ring-2 ring-primary/30"
      )}
    >
      <div className="flex items-stretch">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="Trascina per riordinare"
          title="Trascina per riordinare"
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing px-1 flex items-center text-muted-foreground/50 hover:text-foreground rounded-l-xl hover:bg-muted/60 transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0 py-2 pr-1.5">
          {line.tipo === "articolo" && <ArticleRowContent line={line} mode={mode} onEditArticle={onEditArticle} />}
          {line.tipo === "manuale" && <ManualRowContent line={line} mode={mode} actions={actions} autoFocus={autoFocus} />}
          {isComment && <CommentRowContent line={line} actions={actions} autoFocus={autoFocus} />}
        </div>
        <div className="grid grid-cols-2 gap-1 content-center py-1.5 pr-1.5 shrink-0">
          <IconButton label={isComment ? "Rimuovi nota" : `Rimuovi ${line.descrizione || line.codice}`} onClick={() => actions.removeLine(line.id)} destructive>
            <X className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Aggiungi nota sopra" onClick={() => actions.addCommentLine(line.id)}>
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Sposta su" onClick={() => actions.moveLine(line.id, "up")} disabled={index === 0}>
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Sposta giù" onClick={() => actions.moveLine(line.id, "down")} disabled={index === count - 1}>
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function TrasportoControl({ trasporto, setTrasporto }: { trasporto: OrderLine | undefined; setTrasporto: (importo: number | null) => void }) {
  // La spunta è derivata dalla presenza della riga; l'override locale permette di spuntare prima di digitare l'importo.
  const [checkedOverride, setCheckedOverride] = useState<boolean | null>(null);
  const checked = checkedOverride ?? !!trasporto;

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 flex flex-col gap-2">
      <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer select-none">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => {
            const next = value === true;
            setCheckedOverride(next);
            if (!next) setTrasporto(null);
          }}
          className="h-5 w-5"
          aria-label="Aggiungi spese di trasporto"
        />
        <Truck className="h-4 w-4 text-muted-foreground" />
        Spese di trasporto
      </label>
      {checked && (
        <div className="flex items-center gap-2 pl-7">
          <span className="text-sm text-muted-foreground">€</span>
          <NumberField
            value={trasporto?.prezzoListino ?? 0}
            onCommit={(value) => setTrasporto(value > 0 ? value : null)}
            placeholder="0,00"
            ariaLabel="Importo spese di trasporto"
            className="w-32"
            autoFocus={!trasporto}
          />
          <span className="text-[11px] text-muted-foreground">Verrà aggiunta come ultima riga dell&apos;ordine.</span>
        </div>
      )}
    </div>
  );
}

export default function OrderLinesEditor({ store, mode, onEditArticle, showTrasportoControl = false, listHeightClass }: Props) {
  const orderLines = useOrderStore((s) => s.lines);
  const quotationLines = useQuotationStore((s) => s.lines);
  const lines = store === "quotation" ? quotationLines : orderLines;
  // Le azioni sono funzioni stabili: leggerle una volta evita ri-render su ogni modifica dello store.
  const actions: LineActions = useMemo(
    () => (store === "quotation" ? useQuotationStore.getState() : useOrderStore.getState()),
    [store]
  );

  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const movableLines = useMemo(() => lines.filter((line) => !isTrasportoLine(line)), [lines]);
  const trasporto = getTrasportoLine(lines);
  const movableIds = useMemo(() => movableLines.map((line) => line.id), [movableLines]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    actions.reorderLines(String(active.id), String(over.id));
  }

  function handleAddManual() {
    const id = actions.addManualLine(null);
    setLastAddedId(id);
    window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  function handleAddComment() {
    const id = actions.addCommentLine(null);
    setLastAddedId(id);
    window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  return (
    <div className="flex flex-col gap-2" data-vaul-no-drag>
      {movableLines.length === 0 && !trasporto && (
        <p className="text-xs text-muted-foreground px-1 py-2">Nessuna riga inserita. Aggiungi articoli dal listino oppure una riga manuale.</p>
      )}

      <div ref={listRef} className={cn("flex flex-col gap-2 pr-1", listHeightClass, listHeightClass && "overflow-y-auto")}>
        <DndContext
          id={`lines-dnd-${store}-${mode}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={movableIds} strategy={verticalListSortingStrategy}>
            {movableLines.map((line, index) => (
              <SortableLineRow
                key={line.id}
                line={line}
                index={index}
                count={movableLines.length}
                mode={mode}
                actions={actions}
                onEditArticle={line.tipo === "articolo" ? onEditArticle : undefined}
                autoFocus={line.id === lastAddedId}
              />
            ))}
          </SortableContext>
        </DndContext>

        {trasporto && (
          <div className="rounded-xl border border-border/70 bg-muted/30 px-2.5 py-2 flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold truncate">{trasporto.descrizione}</p>
              <p className="text-[10px] text-muted-foreground">Sempre ultima riga</p>
            </div>
            <span className="text-[11px] font-semibold text-foreground">{formatOrderCurrency(trasporto.prezzoListino)}</span>
            {!showTrasportoControl && (
              <IconButton label="Rimuovi spese di trasporto" onClick={() => actions.setTrasporto(null)} destructive>
                <X className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={handleAddManual}
          className="h-8 px-2.5 rounded-lg border border-dashed border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1.5"
        >
          <PackagePlus className="h-3.5 w-3.5" />
          Articolo manuale
        </button>
        <button
          type="button"
          onClick={handleAddComment}
          className="h-8 px-2.5 rounded-lg border border-dashed border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1.5"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Nota
        </button>
      </div>

      {showTrasportoControl && <TrasportoControl trasporto={trasporto} setTrasporto={actions.setTrasporto} />}
    </div>
  );
}
