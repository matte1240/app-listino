"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  User, Warehouse, MapPin, Calendar, MessageSquare,
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
  Package, Send, Save, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import SearchBar from "@/components/SearchBar";
import MaterialList from "@/components/MaterialList";
import { useOrderStore } from "@/lib/useOrderStore";
import { MAGAZZINI, type AnagraficaSearchItem, type OrderHistoryItem } from "@/types";
import type { Order } from "@/types";
import ExitOrderDialog from "@/components/ExitOrderDialog";

const STEP_LABELS = ["Cliente", "Materiali", "Dettagli", "Riepilogo"] as const;

interface Props {
  /** When provided, we're editing this order */
  editingOrder?: Order;
}

export default function OrderWizard({ editingOrder }: Props) {
  const router = useRouter();

  const materials = useOrderStore((s) => s.materials);
  const orderItems = useOrderStore((s) => s.orderItems);
  const orderInfo = useOrderStore((s) => s.orderInfo);
  const currentStep = useOrderStore((s) => s.currentStep);
  const setStep = useOrderStore((s) => s.setStep);
  const setOrderInfo = useOrderStore((s) => s.setOrderInfo);
  const toggleFlag = useOrderStore((s) => s.toggleFlag);
  const setQty = useOrderStore((s) => s.setQty);
  const resetOrder = useOrderStore((s) => s.resetOrder);

  const exitDialogOpen = useOrderStore((s) => s.exitDialogOpen);
  const setExitDialogOpen = useOrderStore((s) => s.setExitDialogOpen);

  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saved, setSaved] = useState(false);

  // Customer search
  const [customerResults, setCustomerResults] = useState<AnagraficaSearchItem[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<string[]>([]);
  const [recentDestinationsLoading, setRecentDestinationsLoading] = useState(false);
  const [selectedRecentDestination, setSelectedRecentDestination] = useState("");

  const isEditing = !!editingOrder;

  // On mount: if editing, populate store with order data
  useEffect(() => {
    if (!editingOrder) return;
    // Populate orderInfo
    setOrderInfo({
      clienteId: editingOrder.clienteId ?? null,
      cliente: editingOrder.cliente,
      magazzino: editingOrder.magazzino as typeof orderInfo.magazzino,
      luogoConsegna: editingOrder.luogoConsegna,
      dataConsegna: editingOrder.dataConsegna,
      note: editingOrder.note,
    });
    // Populate orderItems from order
    for (const item of editingOrder.items) {
      const current = useOrderStore.getState().orderItems[item.codice];
      if (!current?.flagged) toggleFlag(item.codice);
      if ((current?.qty ?? 0) !== item.qty) setQty(item.codice, item.qty);
    }
    // Start at step 3 when editing (client + materials already set)
    setStep(3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer autocomplete
  useEffect(() => {
    const q = orderInfo.cliente.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      setCustomerLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await fetch(`/api/anagrafiche?q=${encodeURIComponent(q)}&limit=8`, {
          credentials: "same-origin",
        });
        if (!res.ok) { if (!cancelled) setCustomerResults([]); return; }
        const data = await res.json();
        if (!cancelled) setCustomerResults(Array.isArray(data?.anagrafiche) ? data.anagrafiche : []);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [orderInfo.cliente]);

  // Load recent destinations for selected customer
  useEffect(() => {
    if (!orderInfo.clienteId) {
      setRecentDestinations([]);
      setRecentDestinationsLoading(false);
      setSelectedRecentDestination("");
      return;
    }

    let cancelled = false;
    setRecentDestinationsLoading(true);

    fetch(`/api/anagrafiche/${orderInfo.clienteId}/recent-destinations?limit=8`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.destinations) ? data.destinations : [];
      })
      .then((destinations: string[]) => {
        if (!cancelled) {
          setRecentDestinations(destinations);
        }
      })
      .catch(() => {
        if (!cancelled) setRecentDestinations([]);
      })
      .finally(() => {
        if (!cancelled) setRecentDestinationsLoading(false);
      });

    return () => { cancelled = true; };
  }, [orderInfo.clienteId]);

  function handleSelectCustomer(customer: AnagraficaSearchItem) {
    setOrderInfo({
      clienteId: customer.id,
      cliente: customer.ragioneSociale,
    });
    setSelectedRecentDestination("");
    setCustomerDropdownOpen(false);
  }

  // Items derived from store
  const flaggedItems = materials.filter((m) => orderItems[m.codice]?.flagged);
  const flaggedCount = flaggedItems.length;
  const totalPz = flaggedItems.reduce((s, m) => s + (orderItems[m.codice]?.qty ?? 0), 0);

  const canGoNextStep1 = orderInfo.cliente.trim() !== "";
  const canGoNextStep2 = flaggedCount > 0;
  const canGoNextStep3 = orderInfo.magazzino !== "";
  const today = new Date().toISOString().split("T")[0];

  const handleSaveDraftAndExit = useCallback(async () => {
    // If no meaningful data, just exit
    if (!orderInfo.cliente.trim() || flaggedItems.length === 0) {
      resetOrder();
      setExitDialogOpen(false);
      router.push("/orders");
      return;
    }
    setSavingDraft(true);
    try {
      const items: OrderHistoryItem[] = flaggedItems.map((m) => ({
        codice: m.codice,
        descrizione: m.descrizioneAI || m.descrizione,
        qty: orderItems[m.codice]?.qty ?? 0,
        um: m.um,
        prezzoListino: m.prezzoListino,
        sconto: orderItems[m.codice]?.sconto ?? 0,
      }));
      const url = isEditing ? `/api/orders/${editingOrder!.id}` : "/api/orders";
      const method = isEditing ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderInfo, items, status: "bozza" }),
      });
    } catch {
      // Ignore errors on auto-save draft, just exit
    } finally {
      setSavingDraft(false);
      resetOrder();
      setExitDialogOpen(false);
      router.push("/orders");
    }
  }, [orderInfo, flaggedItems, orderItems, isEditing, editingOrder, resetOrder, setExitDialogOpen, router]);

  const handleSave = useCallback(async (status: "bozza" | "confermato") => {
    if (saving) return;
    setSaving(true);
    try {
      const items: OrderHistoryItem[] = flaggedItems.map((m) => ({
        codice: m.codice,
        descrizione: m.descrizioneAI || m.descrizione,
        qty: orderItems[m.codice]?.qty ?? 0,
        um: m.um,
        prezzoListino: m.prezzoListino,
        sconto: orderItems[m.codice]?.sconto ?? 0,
      }));

      const url = isEditing ? `/api/orders/${editingOrder!.id}` : "/api/orders";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderInfo, items, status }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");

      setSaved(true);
      resetOrder();
      setTimeout(() => {
        setSaved(false);
        router.push("/orders");
      }, 1200);
    } catch {
      alert("Errore nel salvataggio dell'ordine");
    } finally {
      setSaving(false);
    }
  }, [saving, flaggedItems, orderItems, orderInfo, isEditing, editingOrder, resetOrder, router]);

  // ────────────────────────────────────────────
  // Stepper header
  // ────────────────────────────────────────────
    const exitDialog = (
      <ExitOrderDialog
        open={exitDialogOpen}
        saving={savingDraft}
        onSaveDraft={handleSaveDraftAndExit}
        onExitWithoutSaving={() => { resetOrder(); setExitDialogOpen(false); router.push("/orders"); }}
        onContinue={() => setExitDialogOpen(false)}
      />
    );

    const Stepper = () => (
    <div className="flex items-center gap-0 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
        const isActive = currentStep === stepNum;
        const isDone = currentStep > stepNum;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`flex h-7 w-7 rounded-full items-center justify-center text-xs font-bold transition-all ${
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </div>
              <span
                className={`text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap ${
                  isActive ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mt-[-10px] transition-colors ${isDone ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ────────────────────────────────────────────
  // Step 1 — Cliente
  // ────────────────────────────────────────────
  if (currentStep === 1) {
    return (
        <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
          {exitDialog}
          <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground mb-0.5">Seleziona cliente</h2>
            <p className="text-sm text-muted-foreground">Cerca nelle anagrafiche o inserisci il nome manualmente.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cliente" className="text-sm font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Cliente <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="cliente"
                placeholder="Nome azienda o cliente"
                value={orderInfo.cliente}
                autoFocus
                onFocus={() => setCustomerDropdownOpen(true)}
                onBlur={() => { setTimeout(() => setCustomerDropdownOpen(false), 120); }}
                onChange={(e) => {
                  setOrderInfo({ cliente: e.target.value, clienteId: null });
                  setRecentDestinations([]);
                  setRecentDestinationsLoading(false);
                  setSelectedRecentDestination("");
                  setCustomerDropdownOpen(true);
                  if (!isEditing) {
                    setOrderInfo({ luogoConsegna: "" });
                  }
                }}
                className="h-11 rounded-xl text-base bg-background"
                style={{ fontSize: "16px" }}
                autoComplete="organization"
              />
              {customerDropdownOpen && orderInfo.cliente.trim().length >= 2 && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                  {customerLoading && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Ricerca clienti...
                    </div>
                  )}
                  {!customerLoading && customerResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Nessuna anagrafica trovata. Puoi inserire il cliente manualmente.
                    </div>
                  )}
                  {!customerLoading && customerResults.length > 0 && (
                    <div className="max-h-56 overflow-y-auto">
                      {customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectCustomer(customer)}
                          className={`w-full text-left px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-muted/50 transition-colors ${
                            customer.id === orderInfo.clienteId ? "bg-primary/10" : ""
                          }`}
                        >
                          <p className="text-sm font-medium truncate">{customer.ragioneSociale}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {customer.codice}{customer.partitaIva ? ` · P.IVA ${customer.partitaIva}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {orderInfo.clienteId ? (
              <p className="text-[11px] text-primary">✓ Cliente selezionato da anagrafica</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Cerca nelle anagrafiche o inserisci il nome manualmente</p>
            )}
          </div>

          <Button
            className="mt-2 h-11 gap-2 font-semibold"
            disabled={!canGoNextStep1}
            onClick={() => setStep(2)}
          >
            Avanti — Seleziona materiali
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 2 — Materiali (full page with sidebar)
  // ────────────────────────────────────────────
  if (currentStep === 2) {
    return (
      <div className="min-h-dvh flex flex-col">
          {exitDialog}
        {/* Sticky search */}
        <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3">
            <div className="flex-1">
              <SearchBar />
            </div>
          </div>
        </div>

        <div className="flex flex-1 max-w-5xl mx-auto w-full">
          {/* Materials catalog */}
          <main className="flex-1 px-4 py-5">
            <Stepper />
            <MaterialList />
          </main>

          {/* Sticky sidebar */}
          <aside className="hidden md:flex w-64 shrink-0 flex-col gap-3 px-4 py-5 border-l border-border sticky top-[calc(3.5rem+49px)] self-start max-h-[calc(100dvh-3.5rem-49px)] overflow-y-auto">
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 rounded-full bg-primary/10 items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Cliente</p>
                  <p className="text-sm font-semibold truncate">{orderInfo.cliente}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  {flaggedCount > 0 ? (
                    <><strong className="text-foreground">{flaggedCount}</strong> articoli selezionati</>
                  ) : (
                    "Nessun articolo selezionato"
                  )}
                </span>
              </div>
              {flaggedCount > 0 && (
                <div className="text-xs text-muted-foreground">
                  Totale: <strong className="text-foreground">{totalPz} pz</strong>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="gap-2 text-sm"
            >
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button
              className="gap-2 text-sm font-semibold"
              disabled={!canGoNextStep2}
              onClick={() => setStep(3)}
            >
              Avanti
              <ChevronRight className="h-4 w-4" />
              {flaggedCount > 0 && <Badge className="ml-1 rounded-full px-2 py-0 h-5 text-xs">{flaggedCount}</Badge>}
            </Button>
          </aside>
        </div>

        {/* Mobile sticky bottom bar */}
        <div className="md:hidden sticky bottom-0 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <div className="flex-1 text-center text-sm">
            <span className="font-semibold">{flaggedCount}</span>
            <span className="text-muted-foreground"> articoli</span>
          </div>
          <Button
            size="sm"
            className="gap-1.5 font-semibold"
            disabled={!canGoNextStep2}
            onClick={() => setStep(3)}
          >
            Avanti
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 3 — Dettagli
  // ────────────────────────────────────────────
  if (currentStep === 3) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
          {exitDialog}
        <Stepper />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground mb-0.5">Dettagli ordine</h2>
            <p className="text-sm text-muted-foreground">
              Ordine per <strong>{orderInfo.cliente}</strong> · {flaggedCount} articoli selezionati
            </p>
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
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ fontSize: "16px" }}
            >
              <option value="">Seleziona magazzino…</option>
              {MAGAZZINI.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Luogo consegna */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="luogo" className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Luogo di consegna
            </Label>
            {/* Recent destinations dropdown */}
            <select
              value={selectedRecentDestination}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedRecentDestination(value);
                if (value) setOrderInfo({ luogoConsegna: value });
              }}
              disabled={!orderInfo.clienteId || recentDestinationsLoading || recentDestinations.length === 0}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <option value="">
                {recentDestinationsLoading
                  ? "Caricamento destinazioni recenti..."
                  : !orderInfo.clienteId
                    ? "Seleziona prima un cliente da anagrafica"
                    : recentDestinations.length === 0
                      ? "Nessuna destinazione recente disponibile"
                      : "Destinazioni recenti del cliente"}
              </option>
              {recentDestinations.map((destination) => (
                <option key={destination} value={destination}>
                  {destination}
                </option>
              ))}
            </select>
            {/* Manual input */}
            <Input
              id="luogo"
              placeholder="Indirizzo di consegna (opzionale)"
              value={orderInfo.luogoConsegna}
              onChange={(e) => {
                setOrderInfo({ luogoConsegna: e.target.value });
                if (selectedRecentDestination && e.target.value !== selectedRecentDestination) {
                  setSelectedRecentDestination("");
                }
              }}
              className="h-11 rounded-xl text-base bg-background"
              style={{ fontSize: "16px" }}
            />
          </div>

          {/* Data consegna */}
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
              Note
            </Label>
            <Textarea
              id="note"
              placeholder="Istruzioni speciali, note di consegna…"
              value={orderInfo.note}
              onChange={(e) => setOrderInfo({ note: e.target.value })}
              className="rounded-xl text-base bg-background resize-none"
              rows={3}
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button
              className="flex-1 h-11 gap-2 font-semibold"
              onClick={() => setStep(4)}
            >
              Avanti — Riepilogo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────
  // Step 4 — Riepilogo
  // ────────────────────────────────────────────
  if (saved) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-6 pb-10 flex flex-col items-center gap-4 text-center">
          {exitDialog}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{isEditing ? "Ordine aggiornato!" : "Ordine salvato!"}</h2>
        <p className="text-sm text-muted-foreground">Reindirizzamento agli ordini…</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
        {exitDialog}
      <Stepper />
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-0.5">Riepilogo ordine</h2>
          <p className="text-sm text-muted-foreground">Controlla i dati prima di salvare o inviare.</p>
        </div>

        {/* Cliente + dettagli */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="font-semibold">{orderInfo.cliente}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Magazzino</p>
              <p className="font-semibold">{orderInfo.magazzino}</p>
            </div>
          </div>
          {orderInfo.luogoConsegna && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Luogo consegna</p>
                <p className="font-semibold">{orderInfo.luogoConsegna}</p>
              </div>
            </div>
          )}
          {orderInfo.dataConsegna && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data consegna</p>
                <p className="font-semibold">
                  {new Date(orderInfo.dataConsegna).toLocaleDateString("it-IT", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                </p>
              </div>
            </div>
          )}
          {orderInfo.note && (
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Note</p>
                <p className="font-medium text-foreground/80">{orderInfo.note}</p>
              </div>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Articoli</span>
            <Badge className="ml-auto rounded-full px-2.5 text-xs">{flaggedCount}</Badge>
          </div>
          <div className="divide-y divide-border/60">
            {flaggedItems.map((m) => {
              const qty = orderItems[m.codice]?.qty ?? 0;
              const sconto = orderItems[m.codice]?.sconto ?? 0;
              const prezzoScontato = sconto > 0 ? m.prezzoListino * (1 - sconto / 100) : null;
              return (
                <div key={m.codice} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold font-mono">{m.codice}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.descrizioneAI || m.descrizione}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className="font-bold">{qty}</span>
                    <span className="text-muted-foreground">{m.um}</span>
                    {sconto > 0 ? (
                      <span className="flex items-center gap-1">
                        <span className="line-through text-muted-foreground/50">€{m.prezzoListino.toFixed(3)}</span>
                        <span className="font-semibold text-primary">€{prezzoScontato!.toFixed(3)}</span>
                        <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{sconto}%</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">€{m.prezzoListino.toFixed(3)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex justify-between text-sm">
            <span className="text-muted-foreground">Totale pezzi</span>
            <span className="font-bold">{totalPz} pz</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-2">
          <Button
            variant="outline"
            className="h-11 gap-2 px-4"
            onClick={() => setStep(3)}
            disabled={saving}
          >
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11 gap-2 font-semibold border-dashed"
            onClick={() => handleSave("bozza")}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva bozza
          </Button>
          <Button
            className="flex-1 h-11 gap-2 font-semibold"
            onClick={() => handleSave("confermato")}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Invia a magazzino
          </Button>
        </div>
      </div>
    </div>
  );
}
