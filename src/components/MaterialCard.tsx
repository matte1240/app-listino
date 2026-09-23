"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Sparkles, AlertCircle, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import DiscountSelector from "@/components/DiscountSelector";
import { formatOrderCurrency, formatSconto, formatUnitPrice } from "@/lib/order-totals";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";
import { useAuth } from "@/lib/auth-context";
import { findArticleLine } from "@/lib/order-lines";
import type { Material } from "@/types";
import { cn, parseLocalizedNumber } from "@/lib/utils";

interface Props {
  material: Material;
  isReadOnlyCatalog?: boolean;
  store?: "order" | "quotation";
  onArticleConfirmed?: () => void;
  openArticleRequest?: { codice: string; requestId: number } | null;
  onOpenArticleRequestHandled?: (requestId: number) => void;
}

export default function MaterialCard({
  material,
  isReadOnlyCatalog = false,
  store = "order",
  onArticleConfirmed,
  openArticleRequest,
  onOpenArticleRequestHandled,
}: Props) {
  const { codice, descrizione, descrizioneAI, um, prezzoListino, raggr, obsoleto, mqConfezione, pzBancale, mqBancale } = material;
  const orderLine = useOrderStore((s) => findArticleLine(s.lines, codice));
  const orderUpsert = useOrderStore((s) => s.upsertArticolo);
  const orderSetMaterialDescrizioneAI = useOrderStore((s) => s.setMaterialDescrizioneAI);
  const quotationLine = useQuotationStore((s) => findArticleLine(s.lines, codice));
  const quotationUpsert = useQuotationStore((s) => s.upsertArticolo);
  const quotationSetMaterialDescrizioneAI = useQuotationStore((s) => s.setMaterialDescrizioneAI);
  const activeItem = store === "quotation" ? quotationLine : orderLine;
  const upsertArticolo = store === "quotation" ? quotationUpsert : orderUpsert;
  const setMaterialDescrizioneAI = store === "quotation" ? quotationSetMaterialDescrizioneAI : orderSetMaterialDescrizioneAI;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const handleRegenerateAI = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (enriching) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/ai/enrich/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEnrichError(data?.error || `Errore (${res.status})`);
        return;
      }
      if (typeof data?.descrizioneAI === "string") {
        setMaterialDescrizioneAI(codice, data.descrizioneAI);
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setEnriching(false);
    }
  };

  const isInCart = !!activeItem;
  const cartQty = activeItem?.qty ?? 0;
  const cartSconto = activeItem?.sconto ?? 0;

  const [expanded, setExpanded] = useState(false);
  const [draftQty, setDraftQty] = useState(0);
  const [draftQtyInput, setDraftQtyInput] = useState("");
  const [draftSconto, setDraftSconto] = useState<number>(0);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const formatMetricValue = (value: number) => new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);

  const materialMetrics = [
    mqConfezione !== null && mqConfezione !== undefined
      ? { label: "mq/conf.", value: formatMetricValue(mqConfezione) }
      : null,
    pzBancale !== null && pzBancale !== undefined
      ? { label: "pz/bancale", value: formatMetricValue(pzBancale) }
      : null,
    mqBancale !== null && mqBancale !== undefined
      ? { label: "mq/bancale", value: formatMetricValue(mqBancale) }
      : null,
  ].filter((metric): metric is { label: string; value: string } => metric !== null);

  const showQtyRow = expanded;

  const dismissKeyboard = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      active.blur();
    }
  };

  const resetDraft = () => {
    setDraftQty(0);
    setDraftQtyInput("");
    setDraftSconto(0);
    setEditorMode("add");
    setExpanded(false);
  };

  const setDraftQtyValue = (qty: number) => {
    const nextQty = Math.max(0, qty);
    setDraftQty(nextQty);
    setDraftQtyInput(nextQty === 0 ? "" : String(nextQty));
  };

  const openEditor = ({ resetValues = true, mode = "add" }: { resetValues?: boolean; mode?: "add" | "edit" } = {}) => {
    setExpanded(true);
    setEditorMode(mode);
    if (resetValues) {
      if (mode === "edit") {
        setDraftQtyValue(cartQty);
        setDraftSconto(cartSconto);
      } else {
        setDraftQtyValue(0);
        setDraftSconto(isInCart ? cartSconto : 0);
      }
    }
    window.requestAnimationFrame(() => qtyInputRef.current?.focus());
  };

  const handleQtyChange = (value: string) => {
    setDraftQtyInput(value);
    const parsed = parseLocalizedNumber(value);
    setDraftQty(Math.max(0, parsed));
  };

  const handleConfirm = () => {
    if (draftQty <= 0) return;
    const nextQty = editorMode === "edit" ? draftQty : (isInCart ? cartQty : 0) + draftQty;
    upsertArticolo(material, nextQty, draftSconto);
    resetDraft();
    onArticleConfirmed?.();
  };

  useEffect(() => {
    if (!openArticleRequest || openArticleRequest.codice !== codice) return;

    openEditor({ resetValues: true, mode: "edit" });
    window.requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    onOpenArticleRequestHandled?.(openArticleRequest.requestId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openArticleRequest, codice, cartQty, cartSconto, onOpenArticleRequestHandled]);

  useEffect(() => {
    if (!expanded) return;

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      if (draftQty > 0) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (cardRef.current?.contains(target)) return;

      // Same behavior as pressing "Annulla" when nothing was entered.
      setDraftQty(0);
      setDraftSconto(0);
      setEditorMode("add");
      setExpanded(false);
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
    };
  }, [expanded, draftQty]);

  const draftUnitPrice = prezzoListino * (1 - draftSconto / 100);
  const toggleEditor = () => {
    if (expanded) {
      dismissKeyboard();
      resetDraft();
      return;
    }
    openEditor({ resetValues: true, mode: "add" });
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-xl border bg-card p-4 shadow-card transition-[border-color,box-shadow] duration-200 select-none",
        expanded
          ? "border-primary ring-4 ring-primary/10"
          : isInCart
            ? "border-primary/45"
            : obsoleto
              ? "border-dashed border-input bg-muted/40 shadow-none"
              : "border-border/80 hover:border-primary/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          onClick={() => {
            if (!isReadOnlyCatalog) {
              if (expanded) {
                qtyInputRef.current?.focus();
              } else {
                openEditor({ resetValues: true, mode: "add" });
              }
            }
          }}
          className={cn("flex min-w-0 flex-1 flex-col gap-1.5", !isReadOnlyCatalog && "cursor-pointer")}
        >
          {/* Codice, badge e prezzo */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-[13px] leading-5 font-medium",
                  obsoleto ? "bg-muted text-muted-foreground" : "bg-secondary text-primary"
                )}
              >
                {codice}
              </span>
              {um && (
                <span className="rounded-full border border-border px-2 text-[11px] leading-5 font-bold tracking-wide text-foreground/70">
                  {um}
                </span>
              )}
              {obsoleto && (
                <span className="rounded-full bg-sunken px-2 text-[11px] leading-5 font-bold tracking-wide text-muted-foreground uppercase">
                  Obsoleto
                </span>
              )}
              {isInCart && (
                <Chip tone="solid" className="h-5 px-2 text-[11px]">
                  <Check className="size-3!" />
                  {cartQty} {um || "pz"}
                  {cartSconto > 0 && ` · -${formatSconto(cartSconto)}%`}
                </Chip>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[17px] leading-6 font-bold whitespace-nowrap tabular-nums",
                obsoleto ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {formatUnitPrice(prezzoListino)}
            </span>
          </div>

          {/* Descrizione AI (primaria) */}
          <p className={cn("text-[15px] leading-snug font-semibold break-words text-pretty", obsoleto ? "text-muted-foreground" : "text-foreground")}>
            {descrizioneAI || descrizione}
          </p>

          {/* Descrizione originale e raggruppamento */}
          {((descrizioneAI && descrizione) || raggr) && (
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              {descrizioneAI && descrizione ? <span className="min-w-0 font-mono break-words">{descrizione}</span> : <span />}
              {raggr && <span className="shrink-0 font-semibold">{raggr}</span>}
            </div>
          )}
        </div>

        {(!isReadOnlyCatalog || isAdmin) && (
          <div className="flex max-w-[140px] shrink-0 flex-col items-end gap-2">
            {!isReadOnlyCatalog && (
              <button
                type="button"
                onClick={toggleEditor}
                aria-label={expanded ? `Chiudi ${codice}` : `Aggiungi ${codice}`}
                aria-expanded={expanded}
                className={cn(
                  "flex size-11 items-center justify-center rounded-lg border transition-colors",
                  expanded
                    ? "border-input bg-card text-muted-foreground hover:text-foreground"
                    : "border-primary/15 bg-secondary text-primary hover:border-primary/40"
                )}
              >
                {expanded ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" strokeWidth={2.4} />}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={handleRegenerateAI}
                disabled={enriching}
                title={enriching ? "Rigenerazione in corso…" : "Rigenera descrizione AI"}
                aria-label="Rigenera descrizione AI"
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold tracking-wide uppercase transition-colors",
                  enriching
                    ? "cursor-wait border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                )}
              >
                <Sparkles className={cn("h-3.5 w-3.5", enriching && "animate-spin")} />
                AI
              </button>
            )}
            {isAdmin && enrichError && (
              <div className="flex items-start gap-1 text-right text-[11px] text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="break-words">{enrichError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quantità e sconto — solo nel wizard, a card aperta */}
      {!isReadOnlyCatalog && showQtyRow && (
        <div className="mt-3.5 flex flex-col gap-3.5 rounded-lg bg-muted/70 p-3.5">
          {materialMetrics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {materialMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs"
                >
                  <span className="font-medium text-muted-foreground">{metric.label}</span>
                  <span className="font-semibold text-foreground">{metric.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`qty-${codice}`} className="text-[13px] font-semibold text-foreground/80">
              {editorMode === "edit" ? "Quantità" : isInCart ? "Quantità da aggiungere" : "Quantità"}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-input bg-card">
                <button
                  type="button"
                  onClick={() => {
                    dismissKeyboard();
                    setDraftQtyValue(draftQty - 1);
                  }}
                  className="flex size-11 items-center justify-center text-primary transition-colors hover:bg-primary/8 active:bg-primary/15"
                  aria-label="Diminuisci quantità"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.4} />
                </button>
                <input
                  id={`qty-${codice}`}
                  ref={qtyInputRef}
                  type="text"
                  value={draftQtyInput}
                  onChange={(e) => handleQtyChange(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "0") {
                      setDraftQtyValue(0);
                      return;
                    }
                    setDraftQtyValue(parseLocalizedNumber(e.target.value));
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  className="h-11 w-16 border-x border-border bg-card text-center font-bold tabular-nums focus:bg-primary/5 focus:outline-none"
                  style={{ fontSize: "17px" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    dismissKeyboard();
                    setDraftQtyValue(draftQty + 1);
                  }}
                  className="flex size-11 items-center justify-center text-primary transition-colors hover:bg-primary/8 active:bg-primary/15"
                  aria-label="Aumenta quantità"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>
              {um && <span className="w-8 text-xs font-semibold text-muted-foreground">{um}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-foreground/80">Sconto</span>
            <DiscountSelector value={draftSconto} onChange={setDraftSconto} onInteract={dismissKeyboard} size="lg" />
          </div>

          {draftQty > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3 tabular-nums">
              <span className="text-[13px] text-muted-foreground">
                {draftQtyInput || draftQty} × {formatUnitPrice(draftUnitPrice)}
              </span>
              <span className="text-base font-bold text-foreground">{formatOrderCurrency(draftUnitPrice * draftQty)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                dismissKeyboard();
                resetDraft();
              }}
              className="h-11 rounded-lg border border-input bg-card text-sm font-semibold text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => {
                dismissKeyboard();
                handleConfirm();
              }}
              disabled={draftQty <= 0}
              className={cn(
                "h-11 rounded-lg text-sm font-semibold transition-colors",
                draftQty > 0
                  ? "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              )}
            >
              {editorMode === "edit" ? "Salva modifica" : "Conferma"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
