"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  Download,
  FileCode2,
  Loader2,
  Package,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import type { Order } from "@/types";

export default function AdminExportMetodoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) void loadOrders();
  }, [authLoading, isAdmin]);

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (!res.ok) throw new Error("Errore nel caricamento ordini");
      const data = await res.json();
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento ordini");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(order: Order) {
    setDownloadingId(order.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/metodo-xml`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Errore durante la generazione dell'XML");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ordine-metodo-${order.id}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il download");
    } finally {
      setDownloadingId(null);
    }
  }

  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function matchesSearch(order: Order): boolean {
    if (!searchQuery.trim()) return true;
    const text = `${order.id} ${order.cliente} ${order.luogoConsegna} ${order.agente}`.toLowerCase();
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((t) => text.includes(t));
  }

  const filtered = orders.filter(matchesSearch);

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-3xl mx-auto px-4 sm:px-5 pt-5 pb-6 flex flex-col gap-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">
            Admin
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Export Metodo</span>
        </div>

        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <FileCode2 className="h-5 w-5" />
            Export ordine in XML per Metodo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona un ordine e scaricalo come file XML conforme al tracciato di import del gestionale Metodo
            (menù <em>Varie → Acquisizione ordine da XML</em>).
          </p>
        </div>

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

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">Nessun ordine disponibile</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground text-center">
            Nessun ordine corrisponde alla ricerca.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((order) => {
              const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
              const isDownloading = downloadingId === order.id;
              const canExport = !!order.clienteId;
              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground leading-tight">
                        {order.cliente}{" "}
                        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground/80">
                          #{order.id}
                        </span>
                      </span>
                      <Badge variant="outline" className="text-xs px-2 py-0 h-5">
                        {order.magazzino}
                      </Badge>
                      {!canExport && (
                        <Badge
                          variant="outline"
                          className="text-xs px-2 py-0 h-5 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-700"
                        >
                          Senza anagrafica
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 mt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(order.createdAt)}</span>
                      <span className="hidden sm:inline text-muted-foreground/60">·</span>
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {order.items.length} art. — {totalQty} pz
                      </span>
                      {order.dataConsegna && (
                        <>
                          <span className="hidden sm:inline text-muted-foreground/60">·</span>
                          <span>Consegna: {formatDate(order.dataConsegna)}</span>
                        </>
                      )}
                      <span className="hidden sm:inline text-muted-foreground/60">·</span>
                      <span>{order.agente}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDownload(order)}
                    disabled={!canExport || isDownloading}
                    title={
                      canExport
                        ? "Scarica file XML per Metodo"
                        : "Ordine senza anagrafica collegata: codice cliente Metodo non disponibile"
                    }
                    className="w-full justify-center sm:w-auto shrink-0"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generazione...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Scarica XML
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
