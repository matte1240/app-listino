"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const setEditing = useOrderStore((s) => s.setEditing);

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
    resetOrder();
    setOrderInfo({
      clienteId: order.clienteId ?? null,
      cliente: order.cliente,
      magazzino: order.magazzino as Parameters<typeof setOrderInfo>[0]["magazzino"],
      luogoConsegna: order.luogoConsegna,
      dataConsegna: order.dataConsegna,
      note: order.note,
    });
    setEditing(order.id, order.items);
    if (!order.clienteId) {
      alert(
        "Ordine storico: seleziona il cliente dalle anagrafiche prima di salvare le modifiche."
      );
    }
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
        <Loader2 className="h-6 w-6 animate-spin text-ivi-navy" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivi-bg">
      {/* Page header */}
      <div className="bg-ivi-navy px-4 pt-5 pb-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-lg font-bold text-white">Storico ordini</div>
          <div className="text-xs text-white/50 mt-0.5">
            {orders.length} ordini salvati
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-8 flex flex-col gap-2">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-ivi-border flex items-center justify-center">
              <Clock className="h-8 w-8 text-ivi-muted" />
            </div>
            <div>
              <p className="font-semibold text-ivi-text">Nessun ordine salvato</p>
              <p className="text-sm text-ivi-muted mt-1">
                Gli ordini salvati appariranno qui
              </p>
            </div>
          </div>
        ) : (
          orders.map((order) => {
            const isOpen = expanded === order.id;
            const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
            const totalVal = order.items.reduce(
              (s, i) => s + i.prezzoListino * i.qty,
              0
            );
            const showDeleteConfirm = deleteConfirm === order.id;
            return (
              <div
                key={order.id}
                className={`rounded-xl border bg-white overflow-hidden transition-all ${
                  isOpen ? "border-ivi-navy/40" : "border-ivi-border"
                }`}
              >
                {/* Header row */}
                <button
                  className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-ivi-bg/60 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                >
                  <div className="w-9 h-9 rounded-[9px] bg-ivi-navy/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-[17px] w-[17px] text-ivi-navy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-ivi-text">
                        {order.cliente}
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ivi-navy/8 text-ivi-navy">
                        {order.magazzino}
                      </span>
                      {!order.clienteId && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Da allineare
                        </span>
                      )}
                      {user?.role === "admin" && (
                        <span className="text-[11px] text-ivi-muted/70">
                          {order.agente}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-ivi-muted">
                      <span>{formatDate(order.createdAt)}</span>
                      <span className="opacity-50">·</span>
                      <span>
                        {order.items.length} art. — {totalQty} pz
                      </span>
                      <span className="opacity-50">·</span>
                      <span className="font-semibold text-ivi-navy">
                        €{totalVal.toFixed(2)}
                      </span>
                      {order.dataConsegna && (
                        <>
                          <span className="opacity-50">·</span>
                          <span>Consegna: {formatDelivery(order.dataConsegna)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-ivi-muted shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-ivi-muted shrink-0 mt-0.5" />
                  )}
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-ivi-border">
                    {(order.luogoConsegna || order.note) && (
                      <div className="px-4 py-3 bg-ivi-bg/50 flex flex-col gap-1 text-xs text-ivi-muted border-b border-ivi-border">
                        {order.luogoConsegna && (
                          <span>
                            <strong>Commessa:</strong> {order.luogoConsegna}
                          </span>
                        )}
                        {order.note && (
                          <span>
                            <strong>Note:</strong> {order.note}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Items */}
                    <div className="divide-y divide-ivi-border/60">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold font-mono text-ivi-text">
                              {item.codice}
                            </p>
                            <p className="text-xs text-ivi-muted truncate mt-0.5">
                              {item.descrizione}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-xs">
                            <span className="font-bold text-ivi-navy">{item.qty}</span>
                            <span className="text-ivi-muted">{item.um}</span>
                            <span className="text-ivi-muted/60">
                              €{item.prezzoListino.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Delete confirmation */}
                    {showDeleteConfirm && (
                      <div className="px-4 py-4 border-t border-ivi-red/20 bg-ivi-red/5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ivi-red/10 shrink-0">
                            <AlertTriangle className="h-4 w-4 text-ivi-red" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-ivi-red">
                              Conferma cancellazione
                            </p>
                            <p className="text-xs text-ivi-muted mt-1">
                              L&apos;ordine #{order.id} per{" "}
                              <strong>{order.cliente}</strong> verrà eliminato e sarà
                              inviata una email di cancellazione.
                            </p>
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => handleDelete(order.id)}
                                disabled={deleting}
                                className="rounded-xl text-xs h-8 bg-ivi-red hover:bg-ivi-red/90"
                              >
                                {deleting ? (
                                  <>
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />{" "}
                                    Cancellazione…
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-3 w-3 mr-1.5" /> Sì, cancella
                                  </>
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
                      <div className="px-4 py-3 border-t border-ivi-border flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(order)}
                          className="text-ivi-navy hover:bg-ivi-navy/8 hover:text-ivi-navy rounded-xl text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Modifica
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(order.id)}
                          className="text-ivi-red hover:bg-ivi-red/8 hover:text-ivi-red rounded-xl text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Elimina
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
