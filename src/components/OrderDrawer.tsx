"use client";

import { ShoppingCart, Trash2, SendHorizonal, Pencil, User, MapPin, Calendar, MessageSquare, Package, Warehouse, CheckCircle2, Loader2, Check } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrderStore } from "@/lib/useOrderStore";
import { MAGAZZINI, type AnagraficaSearchItem } from "@/types";
import { useState, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OrderDrawer({ open, onOpenChange }: Props) {
  const materials = useOrderStore((s) => s.materials);
  const orderItems = useOrderStore((s) => s.orderItems);
  const orderInfo = useOrderStore((s) => s.orderInfo);
  const toggleFlag = useOrderStore((s) => s.toggleFlag);
  const setQty = useOrderStore((s) => s.setQty);
  const resetOrder = useOrderStore((s) => s.resetOrder);
  const setOrderInfo = useOrderStore((s) => s.setOrderInfo);
  const editingId = useOrderStore((s) => s.editingId);
  const editingItems = useOrderStore((s) => s.editingItems);
  const setEditing = useOrderStore((s) => s.setEditing);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customerQuery, setCustomerQuery] = useState(orderInfo.cliente);
  const [customerResults, setCustomerResults] = useState<AnagraficaSearchItem[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const customerBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On open, check if we need to load editing items into the order
  useEffect(() => {
    if (!open) return;
    if (editingId !== null && editingItems.length > 0) {
      // Flag + set qty for each item (only if not already loaded)
      for (const item of editingItems) {
        const currentItem = useOrderStore.getState().orderItems[item.codice];
        if (!currentItem?.flagged) {
          toggleFlag(item.codice);
        }
        if ((currentItem?.qty ?? 0) === 0) {
          setQty(item.codice, item.qty);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCustomerQuery(orderInfo.cliente);
  }, [open, orderInfo.cliente]);

  useEffect(() => {
    return () => {
      if (customerBlurTimeoutRef.current) {
        clearTimeout(customerBlurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      setCustomerLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await fetch(`/api/anagrafiche?q=${encodeURIComponent(q)}&limit=8`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setCustomerResults([]);
          return;
        }
        const data = await res.json();
        setCustomerResults(Array.isArray(data?.anagrafiche) ? data.anagrafiche : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCustomerResults([]);
        }
      } finally {
        setCustomerLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [customerQuery, open]);

  const isEditing = editingId !== null;

  // When editing and materials aren't loaded yet, show items from order directly
  const flaggedItems = materials.filter((m) => orderItems[m.codice]?.flagged);

  const editItemsNotInMaterials = isEditing
    ? editingItems.filter((ei) => !materials.some((m) => m.codice === ei.codice))
    : [];

  const totalPz = flaggedItems.reduce(
    (sum, m) => sum + (orderItems[m.codice]?.qty ?? 0),
    0
  ) + editItemsNotInMaterials.reduce((sum, i) => sum + i.qty, 0);
  const obsoleteFlaggedCount = flaggedItems.filter((m) => m.obsoleto).length;

  const hasItems = flaggedItems.length > 0 || editItemsNotInMaterials.length > 0;
  const hasSelectedCustomer = typeof orderInfo.clienteId === "number" && orderInfo.clienteId > 0;
  const canSend = hasSelectedCustomer && hasItems && orderInfo.magazzino !== "";
  const customerNeedsSelection = customerQuery.trim() !== "" && !hasSelectedCustomer;

  function handleSelectCustomer(customer: AnagraficaSearchItem) {
    setOrderInfo({
      clienteId: customer.id,
      cliente: customer.ragioneSociale,
      luogoConsegna: customer.sedeLegale,
    });
    setCustomerQuery(customer.ragioneSociale);
    setCustomerResults([]);
    setCustomerOpen(false);
  }

  function handleCustomerBlur() {
    customerBlurTimeoutRef.current = setTimeout(() => {
      setCustomerOpen(false);
    }, 120);
  }

  function handleCustomerFocus() {
    if (customerBlurTimeoutRef.current) {
      clearTimeout(customerBlurTimeoutRef.current);
      customerBlurTimeoutRef.current = null;
    }
    setCustomerOpen(true);
  }

  async function handleSave() {
    if (!canSend || saving) return;
    setSaving(true);
    try {
      const materialItems = flaggedItems.map((m) => ({
        codice: m.codice,
        descrizione: m.descrizioneAI || m.descrizione,
        qty: orderItems[m.codice]?.qty ?? 0,
        um: m.um,
        prezzoListino: m.prezzoListino,
      }));
      const items = [...materialItems, ...editItemsNotInMaterials];

      const url = isEditing ? `/api/orders/${editingId}` : "/api/orders";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderInfo, items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Errore salvataggio");
      }
      setSaved(true);
      resetOrder();
      setCustomerQuery("");
      setTimeout(() => { setSaved(false); onOpenChange(false); }, 1500);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Errore nel salvataggio dell'ordine");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isEditing) {
      resetOrder();
    }
    onOpenChange(false);
  }

  // Today's date as min for date picker
  const today = new Date().toISOString().split("T")[0];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh] flex flex-col">
        <DrawerHeader className="pb-3 border-b border-border shrink-0">
          <DrawerTitle className="flex items-center gap-2.5 text-lg">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isEditing ? "bg-amber-500" : "bg-primary"} text-primary-foreground`}>
              {isEditing ? <Pencil className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
            </div>
            {isEditing ? "Modifica Ordine" : "Nuovo Ordine"}
            {isEditing && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">#{editingId}</Badge>
            )}
            {hasItems && (
              <Badge className="ml-auto rounded-full px-2.5">{flaggedItems.length + editItemsNotInMaterials.length} art.</Badge>
            )}
          </DrawerTitle>
        </DrawerHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 overscroll-contain px-4 py-4 flex flex-col gap-5">

          {/* ── DATI ORDINE ─────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Dati Ordine
            </h3>
            <div className="flex flex-col gap-3">

              {/* Cliente */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cliente" className="text-sm font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Cliente <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="cliente"
                    placeholder="Cerca per codice o ragione sociale"
                    value={customerQuery}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCustomerQuery(nextValue);
                      setOrderInfo({ cliente: nextValue, clienteId: null });
                      setCustomerOpen(true);
                    }}
                    onFocus={handleCustomerFocus}
                    onBlur={handleCustomerBlur}
                    className="h-11 rounded-xl text-base bg-background"
                    style={{ fontSize: "16px" }}
                    autoComplete="off"
                  />

                  {customerOpen && (customerQuery.trim().length >= 2 || customerLoading) && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                      {customerLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Ricerca clienti…</div>
                      ) : customerResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nessun cliente trovato</div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto">
                          {customerResults.map((customer) => {
                            const selected = customer.id === orderInfo.clienteId;
                            return (
                              <button
                                key={customer.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectCustomer(customer);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold font-mono text-muted-foreground">{customer.codice}</p>
                                  <p className="text-sm font-semibold text-foreground truncate">{customer.ragioneSociale}</p>
                                  {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-auto" />}
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{customer.sedeLegale || "Sede legale non disponibile"}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {hasSelectedCustomer ? (
                  <p className="text-[11px] text-primary">Cliente anagrafica selezionato</p>
                ) : customerNeedsSelection ? (
                  <p className="text-[11px] text-destructive">Seleziona un cliente dai risultati per continuare</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Campo obbligatorio: selezione da anagrafiche</p>
                )}
              </div>

              {/* Magazzino */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="magazzino" className="text-sm font-medium flex items-center gap-1.5">
                  <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                  Magazzino <span className="text-destructive">*</span>
                </Label>
                <select
                  id="magazzino"
                  value={orderInfo.magazzino}
                  onChange={(e) => setOrderInfo({ magazzino: e.target.value as typeof orderInfo.magazzino })}
                  className="h-11 rounded-xl border border-input bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                  style={{ fontSize: "16px" }}
                >
                  <option value="">Seleziona magazzino…</option>
                  {MAGAZZINI.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Luogo di consegna */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="luogo" className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Luogo di consegna
                </Label>
                <Input
                  id="luogo"
                  placeholder="Via, Città, CAP"
                  value={orderInfo.luogoConsegna}
                  onChange={(e) => setOrderInfo({ luogoConsegna: e.target.value })}
                  className="h-11 rounded-xl text-base bg-background"
                  style={{ fontSize: "16px" }}
                  autoComplete="street-address"
                />
                <p className="text-[11px] text-muted-foreground">
                  Precompilato dalla sede legale del cliente; puoi modificarlo manualmente se la destinazione e diversa.
                </p>
              </div>

              {/* Data di consegna */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data" className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Data di consegna
                </Label>
                <Input
                  id="data"
                  type="date"
                  min={today}
                  value={orderInfo.dataConsegna}
                  onChange={(e) => setOrderInfo({ dataConsegna: e.target.value })}
                  className="h-11 rounded-xl text-base bg-background"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* Note */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="note" className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Note varie
                </Label>
                <Textarea
                  id="note"
                  placeholder="Istruzioni di consegna, riferimenti, richieste speciali..."
                  value={orderInfo.note}
                  onChange={(e) => setOrderInfo({ note: e.target.value })}
                  className="rounded-xl text-base bg-background min-h-[80px] resize-none"
                  style={{ fontSize: "16px" }}
                  rows={3}
                />
              </div>
            </div>
          </section>

          {/* ── ARTICOLI SELEZIONATI ─────────────────────────── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Articoli
              {hasItems && (
                <span className="text-muted-foreground font-normal normal-case tracking-normal">
                  ({flaggedItems.length + editItemsNotInMaterials.length})
                </span>
              )}
            </h3>

            {obsoleteFlaggedCount > 0 && (
              <div className="mb-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Attenzione: {obsoleteFlaggedCount} articolo/i selezionato/i e segnato/i come obsoleto.
                </p>
              </div>
            )}

            {!hasItems ? (
              <div className="py-8 text-center rounded-2xl border border-dashed border-border bg-muted/30">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">Nessun articolo selezionato</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] mx-auto">
                  Chiudi e spunta gli articoli nella lista
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {flaggedItems.map((m, idx) => {
                  const qty = orderItems[m.codice]?.qty ?? 0;
                  const isLast = idx === flaggedItems.length - 1 && editItemsNotInMaterials.length === 0;
                  return (
                    <div
                      key={m.codice}
                      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors ${!isLast ? "border-b border-border/60" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`text-sm font-bold font-mono truncate ${m.obsoleto ? "text-muted-foreground" : "text-foreground"}`}>
                            {m.codice}
                          </p>
                          {m.obsoleto && (
                            <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 uppercase tracking-wide border-muted-foreground/30 text-muted-foreground">
                              Obsoleto
                            </Badge>
                          )}
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${m.obsoleto ? "text-muted-foreground/90" : "text-muted-foreground"}`}>
                          {m.descrizione}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {qty > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5 min-w-[48px] justify-center">
                            {qty} pz
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                            qtà mancante
                          </span>
                        )}
                        <button
                          onClick={() => toggleFlag(m.codice)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
                          aria-label="Rimuovi articolo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {/* Items from edited order not in current materials list */}
                {editItemsNotInMaterials.map((item, idx) => (
                  <div
                    key={item.codice}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors ${idx < editItemsNotInMaterials.length - 1 ? "border-b border-border/60" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold font-mono text-foreground truncate">{item.codice}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.descrizione}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5 min-w-[48px] justify-center">
                        {item.qty} pz
                      </span>
                      <button
                        onClick={() => setEditing(editingId, editingItems.filter((i) => i.codice !== item.codice))}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
                        aria-label="Rimuovi articolo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Total row */}
                {totalPz > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-primary/6 border-t border-primary/20">
                    <span className="text-sm font-medium text-muted-foreground">Totale pezzi</span>
                    <span className="font-bold text-lg text-primary">{totalPz}</span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Editing banner */}
          {isEditing && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs text-amber-800 font-medium">
                Stai modificando l&apos;ordine #{editingId}. Al salvataggio verrà inviata una email che annulla e sostituisce il precedente invio.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DrawerFooter className="pt-3 border-t border-border shrink-0">
          {!canSend && (
            <p className="text-xs text-center text-muted-foreground mb-1">
              {!hasSelectedCustomer && !hasItems && orderInfo.magazzino === ""
                ? "Seleziona cliente, magazzino e almeno un articolo"
                : !hasSelectedCustomer && !hasItems
                ? "Seleziona un cliente dalle anagrafiche e almeno un articolo"
                : orderInfo.magazzino === "" && !hasItems
                ? "Seleziona il magazzino e almeno un articolo"
                : !hasSelectedCustomer && orderInfo.magazzino === ""
                ? "Seleziona cliente e magazzino"
                : !hasSelectedCustomer
                ? "Seleziona un cliente dalle anagrafiche"
                : orderInfo.magazzino === ""
                ? "Seleziona il magazzino di destinazione"
                : "Seleziona almeno un articolo per continuare"}
            </p>
          )}
          <Button
            onClick={handleSave}
            disabled={!canSend || saving || saved}
            className={`w-full gap-2 h-12 text-base rounded-xl ${isEditing ? "bg-amber-500 hover:bg-amber-600" : ""}`}
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" /> {isEditing ? "Ordine aggiornato!" : "Ordine salvato!"}</>
            ) : saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvataggio…</>
            ) : isEditing ? (
              <><Pencil className="h-4 w-4" /> Salva Modifiche</>
            ) : (
              <><SendHorizonal className="h-4 w-4" /> Salva Ordine</>
            )}
          </Button>
          {!isEditing && (flaggedItems.length > 0 || orderInfo.cliente) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetOrder}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Azzera ordine
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline" className="h-11 rounded-xl" onClick={handleCancel}>
              Chiudi
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
