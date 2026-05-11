"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2, Pencil, ChevronDown, ChevronUp, Package, AlertTriangle, Loader2, X, Search, Truck, CheckCircle, XCircle, Flag, Undo2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import type { Order, OrderStatus } from "@/types";

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submittingDraftId, setSubmittingDraftId] = useState<number | null>(null);
  const [discardingDraftId, setDiscardingDraftId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user) loadOrders();
  }, [authLoading, user]);

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  function canEditOrder(order: Order) {
    return user?.role === "admin" || order.agente === user?.username;
  }

  function handleEdit(order: Order) {
    router.push(`/orders/${order.id}/edit`);
  }

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        setDeleteConfirm(null);
        setExpanded(null);
      } else {
        alert("Errore nella cancellazione dell'ordine");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleSendDraft(order: Order) {
    const isStandaloneDraft = order.status === "bozza";
    const hasAttachedDraft = !!order.hasDraft;
    if (!isStandaloneDraft && !hasAttachedDraft) return;

    const confirmMessage = isStandaloneDraft
      ? `Vuoi inviare la bozza ordine #${order.id}?`
      : `Vuoi inviare la bozza di modifica per l'ordine #${order.id}?`;

    if (!window.confirm(confirmMessage)) return;

    setSubmittingDraftId(order.id);
    try {
      const res = isStandaloneDraft
        ? await fetch(`/api/orders/${order.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clienteId: order.clienteId,
              cliente: order.cliente,
              magazzino: order.magazzino,
              luogoConsegna: order.luogoConsegna,
              dataConsegna: order.dataConsegna,
              note: order.note,
              items: order.items,
              status: "confermato",
            }),
          })
        : await fetch(`/api/orders/${order.id}/draft`, {
            method: "POST",
          });

      if (!res.ok) {
        alert("Errore durante l'invio della bozza");
        return;
      }

      setExpanded(null);
      await loadOrders();
    } finally {
      setSubmittingDraftId(null);
    }
  }

  async function handleDiscardDraft(order: Order) {
    if (!order.hasDraft) return;

    if (!window.confirm(`Vuoi scartare la bozza di modifica dell'ordine #${order.id}?`)) {
      return;
    }

    setDiscardingDraftId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/draft`, { method: "DELETE" });
      if (!res.ok) {
        alert("Errore durante lo scarto della bozza");
        return;
      }

      await loadOrders();
    } finally {
      setDiscardingDraftId(null);
    }
  }

  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDelivery(date: string) {
    if (!date) return null;
    return new Date(date).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function orderSearchText(order: Order): string {
    return `${order.id} ${order.parentOrderId ?? ""} ${order.cliente} ${order.luogoConsegna} ${order.agenteFullName || order.agente} ${order.agente}`.toLowerCase();
  }

  function matchesSearch(order: Order): boolean {
    if (!searchQuery.trim()) return true;
    const searchText = orderSearchText(order);
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((token) => searchText.includes(token));
  }

  const filteredOrders = orders.filter(matchesSearch);

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-bold text-lg">Cronologia Ordini</h1>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/orders/new")}>
            <Plus className="h-4 w-4" />
            Nuovo ordine
          </Button>
        </div>
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca per numero, cliente, cantiere, agente"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 h-11 rounded-xl border border-border bg-card text-sm shadow-sm placeholder:text-muted-foreground/55 focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring transition-[color,box-shadow]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label="Cancella ricerca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {filteredOrders.length === 0 && orders.length > 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <ClipboardList className="h-9 w-9 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Nessun ordine trovato</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Prova a modificare i criteri di ricerca
                </p>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <ClipboardList className="h-9 w-9 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Nessun ordine salvato</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Gli ordini salvati appariranno qui
                </p>
              </div>
            </div>
          ) : (
            filteredOrders.map((order) => {
            const isOpen = expanded === order.id;
            const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
            const isDraft = order.status === "bozza";
            const hasAttachedDraft = !!order.hasDraft;
            const canSendDraft = isDraft || hasAttachedDraft;
            const isSendingThisDraft = submittingDraftId === order.id;
            const isDiscardingThisDraft = discardingDraftId === order.id;
            const deleteTitle = isDraft ? "Conferma eliminazione bozza" : "Conferma cancellazione";
            const deleteMessage = isDraft
              ? `La bozza #${order.id} per ${order.cliente} verrà eliminata. Non sarà inviata alcuna email al magazzino.`
              : `L'ordine #${order.id} per ${order.cliente} verrà eliminato e sarà inviata una email di cancellazione.${hasAttachedDraft ? " L'eventuale bozza di modifica collegata verrà eliminata automaticamente." : ""} Questa azione non è reversibile.`;
            const editActionLabel = hasAttachedDraft ? "Apri bozza" : isDraft ? "Modifica bozza" : "Modifica ordine";
            const deleteActionLabel = isDraft ? "Elimina bozza" : "Elimina ordine";
            const showDeleteConfirm = deleteConfirm === order.id;
            return (
              <div
                key={order.id}
                className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
              >
                {/* Header row */}
                <button
                  className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground leading-tight">
                        {order.cliente}{" "}
                        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground/80">#{order.id}</span>
                      </span>
                      <Badge variant="outline" className="text-xs px-2 py-0 h-5">{order.magazzino}</Badge>
                      {order.luogoConsegna && (
                        <Badge variant="secondary" className="text-xs px-2 py-0 h-5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">{order.luogoConsegna}</Badge>
                      )}
                      {getStatusBadge(order.status)}
                      {hasAttachedDraft && (
                        <Badge variant="outline" className="text-xs px-2 py-0 h-5 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-700">Bozza aperta</Badge>
                      )}
                      {user?.role === "admin" && (
                        <span className="text-xs text-muted-foreground/70">{order.agenteFullName || order.agente}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                      <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                      <span className="hidden text-xs text-muted-foreground/60 sm:inline">·</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {order.items.length} art. — {totalQty} pz
                      </span>
                      {order.dataConsegna && (
                        <>
                          <span className="hidden text-xs text-muted-foreground/60 sm:inline">·</span>
                          <span className="text-xs text-muted-foreground">
                            Consegna: {formatDelivery(order.dataConsegna)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border">
                    {/* Info */}
                    {(order.luogoConsegna || order.note) && (
                      <div className="px-4 py-3 bg-muted/30 flex flex-col gap-1 text-xs text-muted-foreground border-b border-border">
                        {order.luogoConsegna && (
                          <span><strong>Luogo:</strong> {order.luogoConsegna}</span>
                        )}
                        {order.note && (
                          <span><strong>Note:</strong> {order.note}</span>
                        )}
                      </div>
                    )}

                    {/* Items */}
                    <div className="divide-y divide-border/60">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold font-mono text-foreground">{item.codice}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{item.descrizione}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs sm:shrink-0 sm:justify-end">
                            <span className="font-bold text-foreground">{item.qty}</span>
                            <span className="text-muted-foreground">{item.um}</span>
                            {item.sconto && item.sconto > 0 ? (
                              <span className="flex flex-wrap items-center gap-1 sm:justify-end">
                                <span className="line-through text-muted-foreground/50">€{item.prezzoListino.toFixed(3)}</span>
                                <span className="font-semibold text-primary">€{(item.prezzoListino * (1 - item.sconto / 100)).toFixed(3)}</span>
                                <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{item.sconto}%</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">€{item.prezzoListino.toFixed(3)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Delete confirmation dialog */}
                    {showDeleteConfirm && (
                      <div className="px-4 py-4 border-t border-destructive/30 bg-destructive/5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 shrink-0">
                            <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-destructive">{deleteTitle}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {deleteMessage}
                            </p>
                            <div className="flex flex-col gap-2 mt-3 sm:flex-row">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(order.id)}
                                disabled={deleting}
                                className="text-xs h-8 w-full justify-center sm:w-auto"
                              >
                                {deleting ? (
                                  <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Cancellazione…</>
                                ) : (
                                  <><Trash2 className="h-3 w-3 mr-1.5" /> Sì, conferma eliminazione</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                                className="text-xs h-8 w-full justify-center sm:w-auto"
                              >
                                Annulla
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {canEditOrder(order) && !showDeleteConfirm && (
                      <div className="px-4 py-3 border-t border-border flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        {hasAttachedDraft && !isDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDiscardDraft(order)}
                            disabled={isSendingThisDraft || isDiscardingThisDraft || deleting}
                            className="text-amber-700 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20 text-xs w-full justify-center sm:w-auto"
                          >
                            {isDiscardingThisDraft ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scarto bozza…</>
                            ) : (
                              <><Undo2 className="h-3.5 w-3.5 mr-1.5" /> Scarta bozza</>
                            )}
                          </Button>
                        )}
                        {canSendDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendDraft(order)}
                            disabled={isSendingThisDraft || isDiscardingThisDraft || deleting}
                            className="text-blue-700 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20 text-xs w-full justify-center sm:w-auto"
                          >
                            {isSendingThisDraft ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Invio bozza…</>
                            ) : (
                              <><ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Invia bozza</>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(order)}
                          disabled={isSendingThisDraft || isDiscardingThisDraft}
                          className="text-primary hover:bg-primary/10 hover:text-primary text-xs w-full justify-center sm:w-auto"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          {editActionLabel}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(order.id)}
                          disabled={isSendingThisDraft || isDiscardingThisDraft}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive text-xs w-full justify-center sm:w-auto"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          {deleteActionLabel}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}

// Helper to render status badge with appropriate icon and color
  function getStatusBadge(status: OrderStatus) {
    if (status === "confermato") {
      return (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600"
          aria-label="Ordine inviato"
          title="Ordine inviato"
        >
          <Flag className="h-3 w-3" />
          <span className="sr-only">Ordine inviato</span>
        </span>
      );
    }

    const nonConfirmedStatus: Exclude<OrderStatus, "confermato"> = status;

    const styles: Record<Exclude<OrderStatus, "confermato">, string> = {
      bozza: "bg-amber-100 text-amber-700 border-amber-200",
      in_lavorazione: "bg-purple-100 text-purple-700 border-purple-200",
      spedito: "bg-indigo-100 text-indigo-700 border-indigo-200",
      consegnato: "bg-emerald-100 text-emerald-700 border-emerald-200",
      annullato: "bg-red-100 text-red-700 border-red-200",
    };

    const icons = {
      bozza: <ClipboardList className="h-3.5 w-3.5" />,
      in_lavorazione: <Package className="h-3.5 w-3.5" />,
      spedito: <Truck className="h-3.5 w-3.5" />,
      consegnato: <CheckCircle className="h-3.5 w-3.5" />,
      annullato: <XCircle className="h-3.5 w-3.5" />,
    } satisfies Record<Exclude<OrderStatus, "confermato">, ReactNode>;

    const labels: Record<Exclude<OrderStatus, "confermato">, string> = {
      bozza: "Bozza",
      in_lavorazione: "In Lavorazione",
      spedito: "Spedito",
      consegnato: "Consegnato",
      annullato: "Annullato",
    };

    return (
      <Badge variant="outline" className={`font-medium ${styles[nonConfirmedStatus]}`}>
        {icons[nonConfirmedStatus]}
        <span className="ml-1">{labels[nonConfirmedStatus]}</span>
      </Badge>
    );
  }
