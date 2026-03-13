"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2, ChevronDown, ChevronUp, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import type { Order } from "@/types";

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user) loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleDelete(id: number) {
    if (!confirm("Eliminare questo ordine?")) return;
    await fetch(`/api/orders/${id}`, { method: "DELETE" });
    setOrders((prev) => prev.filter((o) => o.id !== id));
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

                    {/* Actions */}
                    {user?.role === "admin" && (
                      <div className="px-4 py-3 border-t border-border flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(order.id)}
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
