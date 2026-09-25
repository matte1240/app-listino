"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/lib/auth-context";
import { countArticleLines } from "@/lib/order-lines";
import { formatOrderQuantitiesByUnit } from "@/lib/order-totals";
import type { Order, OrderStatus } from "@/types";
import AdminBreadcrumb from "../AdminBreadcrumb";

type ChipTone = "success" | "warning" | "orange" | "purple" | "indigo" | "danger";

const STATUS_CHIP: Record<OrderStatus, { label: string; tone: ChipTone }> = {
  bozza: { label: "Bozza", tone: "warning" },
  in_approvazione: { label: "In approvazione", tone: "orange" },
  confermato: { label: "Inviato", tone: "success" },
  in_lavorazione: { label: "In lavorazione", tone: "purple" },
  spedito: { label: "Spedito", tone: "indigo" },
  consegnato: { label: "Consegnato", tone: "success" },
  annullato: { label: "Annullato", tone: "danger" },
};

/** Stati non esportabili in Metodo (rifiutati anche dall'API): l'ordine non è stato inviato al magazzino o è annullato. */
const NOT_EXPORTABLE_REASON: Partial<Record<OrderStatus, string>> = {
  bozza: "Bozza non ancora inviata al magazzino",
  in_approvazione: "In attesa di approvazione, non ancora inviato al magazzino",
  annullato: "Ordine annullato",
};

/** Motivo per cui l'ordine non si può esportare, `null` se esportabile. */
function getExportBlockReason(order: Order): string | null {
  const statusReason = NOT_EXPORTABLE_REASON[order.status];
  if (statusReason) return statusReason;
  if (!order.clienteId) return "Ordine senza anagrafica collegata: codice cliente Metodo non disponibile";
  return null;
}

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
    const text = `${order.id} ${order.cliente} ${order.luogoConsegna} ${order.agenteFullName || order.agente} ${order.agente}`.toLowerCase();
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((t) => text.includes(t));
  }

  const filtered = orders.filter(matchesSearch);

  if (authLoading || loading) {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background">
      <main className="max-w-3xl mx-auto px-4 sm:px-5 pt-5 pb-6 flex flex-col gap-4">
        <AdminBreadcrumb current="Export Metodo" />

        <div>
          <h1 className="text-[28px] leading-tight font-bold flex items-center gap-2">
            <FileCode2 className="h-5 w-5" />
            Export ordine in XML per Metodo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona un ordine e scaricalo come file XML conforme al tracciato di import del gestionale Metodo
            (menù <em>Varie → Acquisizione ordine da XML</em>). Bozze, ordini in approvazione e annullati non sono
            esportabili.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Cerca per numero, cliente, cantiere, agente"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-12 h-11 rounded-xl border border-border bg-card text-sm shadow-sm placeholder:text-muted-foreground/55 focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring transition-[color,box-shadow]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
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
              const quantities = formatOrderQuantitiesByUnit(order.items);
              const articleCount = countArticleLines(order.items);
              const isDownloading = downloadingId === order.id;
              const blockReason = getExportBlockReason(order);
              const canExport = blockReason === null;
              const status = STATUS_CHIP[order.status];
              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground leading-tight wrap-anywhere">
                        {order.cliente}{" "}
                        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground/80">
                          #{order.id}
                        </span>
                      </span>
                      {status && <Chip tone={status.tone} className="h-5 px-2">{status.label}</Chip>}
                      {order.magazzino && (
                        <Badge variant="outline" className="text-xs px-2 py-0 h-5">
                          {order.magazzino}
                        </Badge>
                      )}
                      {!order.clienteId && (
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
                        {articleCount} art.{quantities ? ` — ${quantities}` : ""}
                      </span>
                      {order.dataConsegna && (
                        <>
                          <span className="hidden sm:inline text-muted-foreground/60">·</span>
                          <span>Consegna: {formatDate(order.dataConsegna)}</span>
                        </>
                      )}
                      <span className="hidden sm:inline text-muted-foreground/60">·</span>
                      <span>{order.agenteFullName || order.agente}</span>
                    </div>
                    {blockReason && (
                      <p className="mt-1.5 text-xs font-medium text-destructive">Non esportabile: {blockReason}.</p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => void handleDownload(order)}
                    disabled={!canExport || isDownloading}
                    title={blockReason ?? "Scarica file XML per Metodo"}
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
