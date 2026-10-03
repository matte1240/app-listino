"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FileText, RefreshCw, ShoppingCart, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/lib/auth-context";
import { formatOrderCurrency } from "@/lib/order-totals";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";
import AdminBreadcrumb from "../AdminBreadcrumb";

interface PeriodTotals {
  orders: number;
  imponibile: number;
}

interface DashboardStats {
  orders: { total: number; inviati: number; inApprovazione: number; bozze: number; annullati: number };
  month: { current: PeriodTotals; previous: PeriodTotals };
  quotations: { attivi: number; inApprovazione: number; rifiutati: number; convertiti: number; persi: number };
  customers: number;
  recentOrders: { id: number; cliente: string; status: OrderStatus; agente: string; createdAt: string; totale: number }[];
}

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

const MIN_PAGE_HEIGHT = "min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))]";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Mese precedente per il confronto ("agosto"). */
function previousMonthName() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return date.toLocaleDateString("it-IT", { month: "long" });
}

/** Variazione rispetto allo stesso periodo del mese precedente (dal giorno 1 a oggi). */
function Delta({ current, previous, format }: { current: number; previous: number; format: (value: number) => string }) {
  const period = `stesso periodo di ${previousMonthName()}`;
  if (previous === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">Nessun ordine nello {period}</p>;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : null;
  return (
    <p
      className={cn(
        "mt-2 flex items-center gap-1 text-xs",
        change > 0 ? "text-emerald-700 dark:text-emerald-400" : change < 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span>
        {change === 0 ? "Invariato" : `${change > 0 ? "+" : ""}${change}%`} rispetto allo {period} ({format(previous)})
      </span>
    </p>
  );
}

function KpiTile({ icon: Icon, label, value, children }: { icon: typeof Users; label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums text-foreground">{value}</p>
      {children}
    </div>
  );
}

/** Ripartizione per stato: le righe sommano sempre al totale mostrato nell'intestazione. */
function Breakdown({
  title,
  total,
  href,
  rows,
}: {
  title: string;
  total: number;
  href: string;
  rows: { label: string; value: number; bar: string }[];
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <Link href={href} className="-my-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {total} in totale
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-foreground/80">{row.label}</span>
              <span className="font-bold tabular-nums text-foreground">{row.value}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", row.bar)} style={{ width: total ? `${(row.value / total) * 100}%` : 0 }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStats(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void fetchStats();
  }, [user, fetchStats]);

  if (loading || (loadingStats && !stats)) {
    return (
      <div className={cn(MIN_PAGE_HEIGHT, "flex items-center justify-center")}>
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  const { orders, month, quotations } = stats ?? {
    orders: { total: 0, inviati: 0, inApprovazione: 0, bozze: 0, annullati: 0 },
    month: { current: { orders: 0, imponibile: 0 }, previous: { orders: 0, imponibile: 0 } },
    quotations: { attivi: 0, inApprovazione: 0, rifiutati: 0, convertiti: 0, persi: 0 },
  };
  const quotationsTotal = quotations.attivi + quotations.inApprovazione + quotations.rifiutati + quotations.convertiti + quotations.persi;
  const conversion = quotationsTotal ? Math.round((quotations.convertiti / quotationsTotal) * 100) : 0;

  return (
    <div className={cn(MIN_PAGE_HEIGHT, "bg-background")}>
      <main className="@container mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-6 pb-8 sm:px-5 lg:px-10 lg:pt-8">
        <AdminBreadcrumb current="Dashboard" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[28px] leading-tight font-bold">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Panoramica dell&apos;attività commerciale</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchStats()}
            disabled={loadingStats}
            aria-label="Aggiorna dati"
            title="Aggiorna dati"
          >
            <RefreshCw className={cn("h-4 w-4", loadingStats && "animate-spin")} />
          </Button>
        </div>

        {error && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>Impossibile caricare le statistiche.</span>
            <Button variant="outline" onClick={() => void fetchStats()} className="w-full sm:w-auto">
              Riprova
            </Button>
          </div>
        )}

        {stats && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @4xl:grid-cols-4">
              <KpiTile icon={ShoppingCart} label="Ordini del mese" value={String(month.current.orders)}>
                <Delta current={month.current.orders} previous={month.previous.orders} format={String} />
              </KpiTile>
              <KpiTile icon={Wallet} label="Imponibile del mese" value={formatOrderCurrency(month.current.imponibile)}>
                <Delta current={month.current.imponibile} previous={month.previous.imponibile} format={formatOrderCurrency} />
              </KpiTile>
              <KpiTile icon={Users} label="Clienti serviti" value={String(stats.customers)}>
                <p className="mt-2 text-xs text-muted-foreground">Con almeno un ordine inserito</p>
              </KpiTile>
              <KpiTile icon={FileText} label="Preventivi convertiti" value={`${conversion}%`}>
                <p className="mt-2 text-xs text-muted-foreground">
                  {quotations.convertiti} su {quotationsTotal} diventati ordini
                </p>
              </KpiTile>
            </div>

            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
              <Breakdown
                title="Ordini per stato"
                total={orders.total}
                href="/orders"
                rows={[
                  { label: "Inviati al magazzino", value: orders.inviati, bar: "bg-emerald-500" },
                  { label: "In approvazione", value: orders.inApprovazione, bar: "bg-orange-500" },
                  { label: "Bozze", value: orders.bozze, bar: "bg-amber-400" },
                  { label: "Annullati", value: orders.annullati, bar: "bg-red-500" },
                ]}
              />
              <Breakdown
                title="Preventivi per stato"
                total={quotationsTotal}
                href="/quotations"
                rows={[
                  { label: "Attivi", value: quotations.attivi, bar: "bg-primary" },
                  { label: "In approvazione", value: quotations.inApprovazione, bar: "bg-orange-500" },
                  { label: "Rifiutati", value: quotations.rifiutati, bar: "bg-red-500" },
                  { label: "Trasformati in ordine", value: quotations.convertiti, bar: "bg-emerald-500" },
                  { label: "Persi", value: quotations.persi, bar: "bg-muted-foreground" },
                ]}
              />
            </div>

            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">Ordini recenti</h2>
                <Link href="/orders" className="-my-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Tutti gli ordini
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {stats.recentOrders.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nessun ordine inserito.</p>
              ) : (
                <ul className="mt-3 flex flex-col divide-y divide-border">
                  {stats.recentOrders.map((order) => {
                    const status = STATUS_CHIP[order.status];
                    return (
                      <li key={order.id}>
                        <Link
                          href={`/orders?open=${order.id}`}
                          className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold leading-snug text-foreground wrap-anywhere">{order.cliente}</p>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                              #{order.id} · <span className="whitespace-nowrap">{formatDateTime(order.createdAt)}</span> · {order.agente}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <span className="font-bold tabular-nums whitespace-nowrap text-foreground">{formatOrderCurrency(order.totale)}</span>
                            {status && <Chip tone={status.tone}>{status.label}</Chip>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
