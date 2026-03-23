"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2, Pencil, ChevronDown, ChevronUp, Package, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useOrderStore } from "@/lib/useOrderStore";
import type { Order } from "@/types";

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const setOrderInfo = useOrderStore((s) => s.setOrderInfo);
  const resetOrder = useOrderStore((s) => s.resetOrder);

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
    // Store the editing order id + info in sessionStorage and navigate to home
    resetOrder();
    setOrderInfo({
      cliente: order.cliente,
      magazzino: order.magazzino as Parameters<typeof setOrderInfo>[0]["magazzino"],
      luogoConsegna: order.luogoConsegna,
      dataConsegna: order.dataConsegna,
      note: order.note,
    });
    // Save editing state so OrderDrawer knows we are editing
    sessionStorage.setItem("editingOrderId", String(order.id));
    sessionStorage.setItem("editingOrderItems", JSON.stringify(order.items));
    router.push("/");
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
        <h1 className="font-bold text-base">Cronologia Ordini</h1>
        {orders.length === 0 ? (
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
          orders.map((order) => {
            const isOpen = expanded === order.id;
            const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
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
                      <span className="font-bold text-sm text-foreground">{order.cliente}</span>
                      <Badge variant="outline" className="text-xs px-2 py-0 h-5">{order.magazzino}</Badge>
                      {user?.role === "admin" && (
                        <span className="text-xs text-muted-foreground/70">{order.agente}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                      <span className="text-xs text-muted-foreground/60">·</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {order.items.length} art. — {totalQty} pz
                      </span>
                      {order.dataConsegna && (
                        <>
                          <span className="text-xs text-muted-foreground/60">·</span>
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
                        <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold font-mono text-foreground">{item.codice}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{item.descrizione}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-xs">
                            <span className="font-bold text-foreground">{item.qty}</span>
                            <span className="text-muted-foreground">{item.um}</span>
                            <span className="text-muted-foreground/60">€{item.prezzoListino.toFixed(3)}</span>
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
                            <p className="text-sm font-semibold text-destructive">Conferma cancellazione</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              L&apos;ordine #{order.id} per <strong>{order.cliente}</strong> verrà eliminato e sarà inviata una email di cancellazione. Questa azione non è reversibile.
                            </p>
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(order.id)}
                                disabled={deleting}
                                className="rounded-xl text-xs h-8"
                              >
                                {deleting ? (
                                  <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Cancellazione…</>
                                ) : (
                                  <><Trash2 className="h-3 w-3 mr-1.5" /> Sì, cancella ordine</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                                className="rounded-xl text-xs h-8"
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
                      <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(order)}
                          className="text-primary hover:bg-primary/10 hover:text-primary rounded-xl text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Modifica ordine
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(order.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Elimina ordine
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
