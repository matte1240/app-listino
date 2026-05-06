"use client";

import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Sparkles, AlertCircle } from "lucide-react";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";
import { useAuth } from "@/lib/auth-context";
import type { Material } from "@/types";
import { cn } from "@/lib/utils";

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
  const { codice, descrizione, descrizioneAI, um, prezzoListino, raggr, obsoleto } = material;
  const orderItem = useOrderStore((s) => s.orderItems[codice]);
  const orderSetQty = useOrderStore((s) => s.setQty);
  const orderSetSconto = useOrderStore((s) => s.setSconto);
  const orderSetMaterialDescrizioneAI = useOrderStore((s) => s.setMaterialDescrizioneAI);
  const quotationItem = useQuotationStore((s) => s.quotationItems[codice]);
  const quotationSetQty = useQuotationStore((s) => s.setQty);
  const quotationSetSconto = useQuotationStore((s) => s.setSconto);
  const quotationSetMaterialDescrizioneAI = useQuotationStore((s) => s.setMaterialDescrizioneAI);
  const activeItem = store === "quotation" ? quotationItem : orderItem;
  const setQty = store === "quotation" ? quotationSetQty : orderSetQty;
  const setSconto = store === "quotation" ? quotationSetSconto : orderSetSconto;
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

  const isInCart = activeItem?.flagged ?? false;
  const cartQty = activeItem?.qty ?? 0;
  const cartSconto = activeItem?.sconto ?? 0;

  const [expanded, setExpanded] = useState(false);
  const [draftQty, setDraftQty] = useState(0);
  const [draftSconto, setDraftSconto] = useState<0 | 8 | 15>(0);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const showQtyRow = expanded;

  const dismissKeyboard = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      active.blur();
    }
  };

  const resetDraft = () => {
    setDraftQty(0);
    setDraftSconto(0);
    setEditorMode("add");
    setExpanded(false);
  };

  const openEditor = ({ resetValues = true, mode = "add" }: { resetValues?: boolean; mode?: "add" | "edit" } = {}) => {
    setExpanded(true);
    setEditorMode(mode);
    if (resetValues) {
      if (mode === "edit") {
        setDraftQty(cartQty);
        setDraftSconto(cartSconto);
      } else {
        setDraftQty(0);
        setDraftSconto(isInCart ? cartSconto : 0);
      }
    }
    window.requestAnimationFrame(() => qtyInputRef.current?.focus());
  };

  const handleQtyChange = (value: string) => {
    const parsed = parseInt(value, 10);
    setDraftQty(isNaN(parsed) ? 0 : Math.max(0, parsed));
  };

  const handleConfirm = () => {
    if (draftQty <= 0) return;
    const nextQty = editorMode === "edit" ? draftQty : (isInCart ? cartQty : 0) + draftQty;
    setQty(codice, nextQty);
    setSconto(codice, draftSconto);
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

  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-2xl border transition-all duration-200 select-none overflow-hidden flex",
        isInCart
          ? "border-primary/35 bg-card shadow-md shadow-primary/10"
          : "border-border bg-card shadow-sm hover:shadow-md hover:border-border/80",
        obsoleto && (isInCart ? "bg-muted/35" : "bg-muted/40 border-border/70")
      )}
    >
      {/* Colored left accent strip when flagged */}
      <div className={cn(
        "w-1 shrink-0 rounded-l-2xl transition-all duration-200",
        isInCart ? "bg-gradient-to-b from-primary to-primary/50" : "bg-transparent"
      )} />

      <div className="p-4 flex-1 min-w-0">
        {/* Top row: checkbox + codice + badge pz/bancale */}
        <div className="flex items-start gap-3">
          {!isReadOnlyCatalog && (
            <Checkbox
              id={`flag-${codice}`}
              checked={expanded}
              onCheckedChange={(checked) => {
                if (checked === true) {
                  openEditor({ resetValues: !expanded, mode: "add" });
                  return;
                }
                resetDraft();
              }}
              className="mt-1 h-5 w-5 shrink-0"
            />
          )}
          <label
            onClick={() => {
              if (!isReadOnlyCatalog) {
                if (expanded) {
                  qtyInputRef.current?.focus();
                } else {
                  openEditor({ resetValues: true, mode: "add" });
                }
              }
            }}
            className={cn("flex-1 min-w-0", !isReadOnlyCatalog && "cursor-pointer")}
          >
            {/* Codice + badges */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn(
                "font-bold text-sm tracking-wide font-mono leading-tight",
                obsoleto ? "text-muted-foreground" : "text-foreground"
              )}>
                {codice}
              </span>
              {obsoleto && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 h-5 shrink-0 uppercase tracking-wide border-muted-foreground/30 text-muted-foreground bg-background/70"
                >
                  Obsoleto
                </Badge>
              )}
              {um && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs px-2 py-0 h-5 shrink-0 font-medium",
                    obsoleto && "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  U.M.: {um}
                </Badge>
              )}
              {isInCart && (
                <Badge className="text-[10px] px-2 py-0 h-5 shrink-0 bg-primary/10 text-primary border border-primary/30">
                  Nel carrello: {cartQty} {um || "pz"}
                </Badge>
              )}
            </div>

            {/* Descrizione AI (primaria - grande e visibile) */}
            <p className={cn(
              "text-sm leading-snug break-words mt-0.5 font-medium",
              obsoleto ? "text-muted-foreground" : "text-foreground/90"
            )}>
              {descrizioneAI || descrizione}
            </p>
            {/* Descrizione originale (secondaria - piccola e grigia) */}
            {descrizioneAI && descrizione && (
              <p className="text-xs text-muted-foreground/70 leading-snug break-words mt-1 italic">
                {descrizione}
              </p>
            )}

            {/* Prezzi */}
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <div className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1",
                obsoleto ? "bg-background/70" : "bg-muted"
              )}>
                <span className="text-xs text-muted-foreground font-medium">Listino</span>
                <span className={cn(
                  "text-xs font-bold",
                  obsoleto ? "text-muted-foreground" : "text-foreground"
                )}>€{prezzoListino.toFixed(3)}</span>
              </div>
              {raggr && (
                <span className={cn(
                  "text-xs font-medium",
                  obsoleto ? "text-muted-foreground/85" : "text-muted-foreground/70"
                )}>{raggr}</span>
              )}
            </div>
          </label>
          {isAdmin && (
            <div className="shrink-0 flex flex-col items-end gap-1 max-w-[140px]">
              <button
                type="button"
                onClick={handleRegenerateAI}
                disabled={enriching}
                title={enriching ? "Rigenerazione in corso…" : "Rigenera descrizione AI"}
                aria-label="Rigenera descrizione AI"
                className={cn(
                  "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-semibold uppercase tracking-wide transition-colors",
                  enriching
                    ? "border-primary/40 bg-primary/10 text-primary cursor-wait"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                )}
              >
                <Sparkles className={cn("h-3 w-3", enriching && "animate-spin")} />
                AI
              </button>
              {enrichError && (
                <div className="flex items-start gap-1 text-[11px] text-destructive text-right">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="break-words">{enrichError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quantity + discount rows — shown when expanded or flagged, hidden in catalog mode */}
        {!isReadOnlyCatalog && showQtyRow && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 pl-8">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Qtà ordine:</span>
              <div className="flex items-center rounded-xl border border-primary/30 bg-background overflow-hidden shadow-sm">
                <button
                  onClick={() => {
                    dismissKeyboard();
                    setDraftQty((prev) => Math.max(0, prev - 1));
                  }}
                  className="flex items-center justify-center h-10 w-11 text-primary hover:bg-primary/8 active:bg-primary/15 transition-colors"
                  aria-label="Diminuisci quantità"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={qtyInputRef}
                  type="number"
                  min={0}
                  value={draftQty === 0 ? "" : draftQty}
                  onChange={(e) => handleQtyChange(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "0") {
                      setDraftQty(0);
                    }
                  }}
                  placeholder="0"
                  inputMode="numeric"
                  className="w-14 h-10 text-center font-bold bg-background border-x border-primary/30 focus:outline-none focus:bg-primary/5"
                  style={{ fontSize: "16px" }}
                />
                <button
                  onClick={() => {
                    dismissKeyboard();
                    setDraftQty((prev) => prev + 1);
                  }}
                  className="flex items-center justify-center h-10 w-11 text-primary hover:bg-primary/8 active:bg-primary/15 transition-colors"
                  aria-label="Aumenta quantità"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {um && (
                <span className="text-xs font-semibold text-muted-foreground">{um}</span>
              )}
            </div>

            {/* Discount selector */}
            <div className="flex items-center gap-2 pl-8">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Sconto:</span>
              <div className="flex gap-1.5">
                {([0, 8, 15] as const).map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      dismissKeyboard();
                      setDraftSconto(pct);
                    }}
                    className={cn(
                      "h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors",
                      draftSconto === pct
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {pct === 0 ? "Nessuno" : `-${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pl-8">
              <button
                onClick={() => {
                  dismissKeyboard();
                  handleConfirm();
                }}
                disabled={draftQty <= 0}
                className={cn(
                  "h-8 px-3 rounded-lg text-xs font-semibold border transition-colors",
                  draftQty > 0
                    ? "bg-primary text-primary-foreground border-primary hover:opacity-95"
                    : "bg-muted text-muted-foreground border-border cursor-not-allowed"
                )}
              >
                {editorMode === "edit" ? "Salva modifica" : "Conferma"}
              </button>
              <button
                onClick={() => {
                  dismissKeyboard();
                  resetDraft();
                }}
                className="h-8 px-3 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
