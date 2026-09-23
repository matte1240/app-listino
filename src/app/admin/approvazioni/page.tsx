"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, ClipboardList, FileText, Loader2, Pencil, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import OrderLineRow from "@/components/OrderLineRow";
import { useAuth } from "@/lib/auth-context";
import { computeOrderDiff, type OrderDiff } from "@/lib/order-diff";
import { getApprovalLines } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, formatOrderCurrency } from "@/lib/order-totals";
import type { Order, OrderHistoryItem, Quotation } from "@/types";

interface PendingApprovals {
  orders: Order[];
  drafts: Order[];
  quotations: Quotation[];
  count: number;
}

type PendingKind = "order" | "draft" | "quotation";

interface PendingCard {
  kind: PendingKind;
  key: string;
  id: number;
  title: string;
  cliente: string;
  agente: string;
  requestedAt: string | null;
  items: OrderHistoryItem[];
  diff?: OrderDiff;
  extra?: string;
  endpoint: string;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toCards(data: PendingApprovals): PendingCard[] {
  const orders: PendingCard[] = data.orders.map((order) => ({
    kind: "order",
    key: `order-${order.id}`,
    id: order.id,
    title: `Ordine #${order.id}`,
    cliente: order.cliente,
    agente: order.agenteFullName || order.agente,
    requestedAt: order.approvalRequestedAt,
    items: order.items,
    extra: `${order.magazzino}${order.luogoConsegna ? ` · ${order.luogoConsegna}` : ""}`,
    endpoint: `/api/orders/${order.id}/approval`,
  }));

  const drafts: PendingCard[] = data.drafts
    .filter((order) => order.draft)
    .map((order) => {
      const draft = order.draft!;
      return {
        kind: "draft",
        key: `draft-${order.id}`,
        id: order.id,
        title: `Modifica ordine #${order.id}`,
        cliente: draft.cliente,
        agente: order.agenteFullName || order.agente,
        requestedAt: draft.approvalRequestedAt,
        items: draft.items,
        diff: computeOrderDiff(order, draft),
        extra: `${draft.magazzino}${draft.luogoConsegna ? ` · ${draft.luogoConsegna}` : ""}`,
        endpoint: `/api/orders/${order.id}/draft/approval`,
      };
    });

  const quotations: PendingCard[] = data.quotations.map((quotation) => ({
    kind: "quotation",
    key: `quotation-${quotation.id}`,
    id: quotation.id,
    title: `Preventivo ${quotation.numero}`,
    cliente: quotation.cliente,
    agente: quotation.agenteFullName || quotation.agente,
    requestedAt: quotation.approvalRequestedAt,
    items: quotation.items,
    extra: `Validità ${quotation.validitaGiorni} giorni${quotation.luogoConsegna ? ` · ${quotation.luogoConsegna}` : ""}`,
    endpoint: `/api/quotations/${quotation.id}/approval`,
  }));

  return [...orders, ...drafts, ...quotations].sort((a, b) => (a.requestedAt ?? "").localeCompare(b.requestedAt ?? ""));
}

function diffSummary(diff: OrderDiff): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} aggiunte`);
  if (diff.modified.length) parts.push(`${diff.modified.length} modificate`);
  if (diff.removed.length) parts.push(`${diff.removed.length} rimosse`);
  if (diff.reordered) parts.push("righe riordinate");
  if (diff.headerChanges.length) parts.push(`${diff.headerChanges.length} campi intestazione`);
  return parts.length ? parts.join(", ") : "nessuna differenza rilevata";
}

export default function AdminApprovalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<PendingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.replace("/");
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/approvals", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as PendingApprovals;
      setCards(toCards(data));
    } catch {
      setError("Impossibile caricare le richieste di approvazione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === "admin") void load();
  }, [authLoading, user, load]);

  async function decide(card: PendingCard, action: "approve" | "reject", note = "") {
    setBusy(card.key);
    try {
      const res = await fetch(card.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Operazione non riuscita");
        await load();
        return;
      }
      toast.success(action === "approve" ? `${card.title} approvato` : `${card.title} rifiutato`);
      setRejecting(null);
      setRejectNote("");
      setCards((prev) => prev.filter((c) => c.key !== card.key));
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || (loading && cards.length === 0)) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-4xl mx-auto px-4 sm:px-5 lg:px-10 pt-6 lg:pt-8 pb-8 flex flex-col gap-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">Admin</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Approvazioni</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[28px] leading-tight font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Approvazioni
              {cards.length > 0 && <Badge className="rounded-full px-2.5">{cards.length}</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Documenti con sconti liberi (diversi da 0, 8% e 15%) in attesa della tua decisione. Le righe interessate sono evidenziate.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 w-full justify-center sm:w-auto" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {cards.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <ShieldCheck className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nessuna richiesta in attesa</p>
              <p className="text-sm text-muted-foreground mt-1">Le richieste di approvazione degli agenti appariranno qui.</p>
            </div>
          </div>
        ) : (
          cards.map((card) => {
            const approvalLines = getApprovalLines(card.items);
            const total = calculateOrderDiscountedTotal(card.items);
            const isBusy = busy === card.key;
            const isRejecting = rejecting === card.key;
            const Icon = card.kind === "quotation" ? FileText : card.kind === "draft" ? Pencil : ClipboardList;
            return (
              <section key={card.key} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-border flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-bold text-sm">{card.title}</span>
                      <Badge variant="outline" className="text-xs px-2 py-0 h-5 text-orange-700 border-orange-300 bg-orange-50">
                        {approvalLines.length} {approvalLines.length === 1 ? "riga a sconto libero" : "righe a sconto libero"}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold mt-1 truncate">{card.cliente}</p>
                    <p className="text-xs text-muted-foreground">
                      Richiesto da <strong>{card.agente}</strong> il {formatDateTime(card.requestedAt)}
                      {card.extra ? ` · ${card.extra}` : ""}
                    </p>
                    {card.diff && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>Differenze rispetto all&apos;ordine inviato:</strong> {diffSummary(card.diff)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Totale imponibile</p>
                    <p className="font-bold text-base">{formatOrderCurrency(total)}</p>
                  </div>
                </div>

                <div className="divide-y divide-border/60">
                  {card.items.map((item, index) => (
                    <OrderLineRow key={item.id ?? index} item={item} variant="quotation" highlightApproval />
                  ))}
                </div>

                {card.diff && card.diff.headerChanges.length > 0 && (
                  <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground flex flex-col gap-0.5">
                    {card.diff.headerChanges.map((change) => (
                      <span key={change.label}>
                        <strong>{change.label}:</strong> <span className="line-through">{change.before || "—"}</span> → {change.after || "—"}
                      </span>
                    ))}
                  </div>
                )}

                <div className="px-4 py-3 border-t border-border bg-muted/20 flex flex-col gap-3">
                  {isRejecting ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        value={rejectNote}
                        onChange={(event) => setRejectNote(event.target.value)}
                        placeholder="Motivazione per l'agente (facoltativa ma consigliata)"
                        rows={2}
                        className="bg-background text-sm"
                        style={{ fontSize: "16px" }}
                        autoFocus
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setRejecting(null); setRejectNote(""); }} disabled={isBusy} className="w-full justify-center sm:w-auto">
                          Annulla
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => void decide(card, "reject", rejectNote)} disabled={isBusy} className="gap-1.5 w-full justify-center sm:w-auto">
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          Conferma rifiuto
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setRejecting(card.key); setRejectNote(""); }}
                        disabled={isBusy}
                        className="gap-1.5 text-destructive hover:text-destructive w-full justify-center sm:w-auto"
                      >
                        <X className="h-3.5 w-3.5" />
                        Rifiuta
                      </Button>
                      <Button size="sm" onClick={() => void decide(card, "approve")} disabled={isBusy} className="gap-1.5 w-full justify-center sm:w-auto">
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {card.kind === "quotation" ? "Approva preventivo" : card.kind === "draft" ? "Approva e applica modifica" : "Approva e invia al magazzino"}
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
