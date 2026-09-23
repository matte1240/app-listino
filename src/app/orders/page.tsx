"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2, Pencil, ChevronDown, Package, AlertTriangle, Loader2, Truck, CheckCircle, XCircle, Undo2, Plus, Clock, ShieldAlert, Calendar, MapPin, MessageSquare, Send, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/lib/auth-context";
import OrderLineRow from "@/components/OrderLineRow";
import PageHeader from "@/components/PageHeader";
import SearchField from "@/components/SearchField";
import SegmentedTabs from "@/components/SegmentedTabs";
import { cn } from "@/lib/utils";
import { countArticleLines } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, calculateOrderTotalPieces, formatOrderCurrency } from "@/lib/order-totals";
import type { Order, OrderStatus } from "@/types";

type OrderTab = "attivi" | "annullati";

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<number | null>(null);
  const [discardingDraftId, setDiscardingDraftId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<OrderTab>("attivi");
  const [orderCounts, setOrderCounts] = useState({ attivi: 0, annullati: 0 });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadOrders(activeTab);
    }
  }, [activeTab, authLoading, user]);

  async function loadOrders(tab: OrderTab) {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?status=${tab}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
        setOrderCounts(data.counts ?? { attivi: 0, annullati: 0 });
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
        const data = await res.json().catch(() => null);
        const nextTab = data?.cancelled ? "annullati" : activeTab;
        setDeleteConfirm(null);
        setExpanded(null);
        if (nextTab !== activeTab) {
          setActiveTab(nextTab);
        }
        await loadOrders(nextTab);
      } else {
        alert("Errore nella cancellazione dell'ordine");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestore(order: Order) {
    if (!window.confirm(`Vuoi ripristinare l'ordine #${order.id}?`)) return;

    setRestoringId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/restore`, { method: "POST" });
      if (!res.ok) {
        alert("Errore durante il ripristino dell'ordine");
        return;
      }

      setExpanded(null);
      if (activeTab !== "attivi") {
        setActiveTab("attivi");
      }
      await loadOrders("attivi");
    } finally {
      setRestoringId(null);
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
              cig: order.cig,
              cup: order.cup,
              dataConsegna: order.dataConsegna,
              note: order.note,
              items: order.items,
              status: "confermato",
            }),
          })
        : await fetch(`/api/orders/${order.id}/draft`, {
            method: "POST",
          });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Errore durante l'invio della bozza");
        return;
      }

      const pending = data?.pendingApproval === true || data?.order?.status === "in_approvazione";
      if (pending) {
        toast.info("Inviato per approvazione: un amministratore deve approvare gli sconti liberi prima dell'invio al magazzino.");
      } else {
        toast.success(isStandaloneDraft ? "Ordine inviato al magazzino" : "Modifica inviata al magazzino");
      }

      setExpanded(null);
      await loadOrders(activeTab);
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

      await loadOrders(activeTab);
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

  const searchTokens = useMemo(
    () => searchQuery.toLowerCase().split(/\s+/).filter(Boolean),
    [searchQuery]
  );

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (searchTokens.length === 0) return true;
        const searchText = orderSearchText(order);
        return searchTokens.every((token) => searchText.includes(token));
      })
      .sort((left, right) => {
        const leftDate = activeTab === "annullati" ? left.cancelledAt || left.updatedAt || left.createdAt : left.createdAt;
        const rightDate = activeTab === "annullati" ? right.cancelledAt || right.updatedAt || right.createdAt : right.createdAt;
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      });
  }, [activeTab, orders, searchTokens]);

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const selectedOrder = filteredOrders.find((order) => order.id === expanded) ?? null;

  /** Dettaglio ordine: in linea sotto la card su mobile, nel pannello laterale su desktop. */
  const renderOrderDetail = (order: Order, inset: string) => {
    const totalQty = calculateOrderTotalPieces(order.items);
    const totalImponibile = calculateOrderDiscountedTotal(order.items);
    const isDraft = order.status === "bozza";
    const isPendingApproval = order.status === "in_approvazione";
    // Ordine mai arrivato al magazzino: eliminazione definitiva invece di annullamento con email.
    const isUnsent = isDraft || isPendingApproval;
    const hasAttachedDraft = !!order.hasDraft;
    const draftPending = order.draftApprovalStatus === "in_approvazione";
    const draftRejected = order.draftApprovalStatus === "rifiutato";
    const canSendDraft = isDraft || (hasAttachedDraft && !draftPending);
    const isSendingThisDraft = submittingDraftId === order.id;
    const isDiscardingThisDraft = discardingDraftId === order.id;
    const isCancelled = order.status === "annullato";
    const isRestoring = restoringId === order.id;
    const deleteTitle = isUnsent ? "Conferma eliminazione" : "Conferma annullamento ordine";
    const deleteMessage = isUnsent
      ? `${isPendingApproval ? "L'ordine in attesa di approvazione" : "La bozza"} #${order.id} per ${order.cliente} verrà eliminat${isPendingApproval ? "o" : "a"}. Non sarà inviata alcuna email al magazzino.`
      : `L'ordine #${order.id} per ${order.cliente} verrà annullato e resterà nello storico. Sarà inviata una email di cancellazione.${hasAttachedDraft ? " L'eventuale bozza di modifica collegata verrà eliminata automaticamente." : ""}`;
    const editActionLabel = hasAttachedDraft ? "Apri bozza" : isDraft ? "Modifica bozza" : "Modifica ordine";
    const deleteActionLabel = isPendingApproval ? "Elimina ordine" : isDraft ? "Elimina bozza" : "Annulla ordine";
    const showDeleteConfirm = deleteConfirm === order.id;

    const meta: { label: string; value: ReactNode; wide?: boolean; mono?: boolean }[] = [
      { label: "Magazzino", value: order.magazzino },
      ...(order.dataConsegna ? [{ label: "Consegna", value: formatDelivery(order.dataConsegna) }] : []),
      ...(order.luogoConsegna ? [{ label: "Luogo di consegna", value: order.luogoConsegna, wide: true }] : []),
      ...(order.cig ? [{ label: "CIG", value: order.cig, mono: true }] : []),
      ...(order.cup ? [{ label: "CUP", value: order.cup, mono: true }] : []),
      ...(isAdmin ? [{ label: "Agente", value: order.agenteFullName || order.agente }] : []),
      { label: "Creato", value: formatDate(order.createdAt) },
      ...(order.cancelledAt ? [{ label: "Annullato il", value: formatDate(order.cancelledAt) }] : []),
      ...(isAdmin && order.cancelledBy ? [{ label: "Annullato da", value: order.cancelledBy }] : []),
      ...(order.cancelledFromStatus ? [{ label: "Stato precedente", value: formatStatusLabel(order.cancelledFromStatus) }] : []),
    ];

    return (
      <div className="flex flex-col">
        <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 bg-muted/50 py-3.5 sm:grid-cols-4", inset)}>
          {meta.map((entry) => (
            <div key={entry.label} className={cn("min-w-0", entry.wide && "col-span-2")}>
              <dt className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{entry.label}</dt>
              <dd className={cn("mt-0.5 text-sm font-semibold break-words text-foreground", entry.mono && "font-mono")}>{entry.value}</dd>
            </div>
          ))}
        </dl>

        {order.note && (
          <div className={cn("flex items-start gap-2 border-t border-border/70 py-3 text-sm text-foreground/85", inset)}>
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span><strong className="font-bold">Note:</strong> {order.note}</span>
          </div>
        )}

        {(isCancelled || isPendingApproval || (isDraft && order.approvalNote) || draftPending || draftRejected) && (
          <div className={cn("flex flex-col gap-2 pt-3", inset)}>
            {isCancelled && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
                L&apos;ordine è nello storico degli annullati e può essere ripristinato mantenendo i dati originali.
              </div>
            )}
            {isPendingApproval && (
              <div className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2.5 text-xs text-orange-800 dark:bg-orange-950/30 dark:text-orange-300">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  In attesa di approvazione di un amministratore per gli sconti liberi
                  {order.approvalRequestedAt ? ` (richiesta il ${formatDate(order.approvalRequestedAt)})` : ""}. Il magazzino non ha ancora ricevuto l&apos;ordine.
                </span>
              </div>
            )}
            {isDraft && order.approvalNote && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Rifiutato{order.approvalDecidedBy ? ` da ${order.approvalDecidedBy}` : ""}:</strong> {order.approvalNote}
                </span>
              </div>
            )}
            {draftPending && (
              <div className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2.5 text-xs text-orange-800 dark:bg-orange-950/30 dark:text-orange-300">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>La modifica con sconti liberi è in attesa di approvazione. L&apos;ordine inviato al magazzino resta quello originale.</span>
              </div>
            )}
            {draftRejected && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Modifica rifiutata:</strong> {order.draftApprovalNote || "nessuna motivazione"}. Apri la bozza per correggerla oppure scartala.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Righe */}
        <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
          {order.items.map((item, idx) => (
            <OrderLineRow key={item.id ?? idx} item={item} variant="order" className={inset} />
          ))}
        </div>

        <div className={cn("flex items-end justify-end gap-8 py-4", inset)}>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Totale pezzi</span>
            <span className="text-base font-bold tabular-nums">{totalQty}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Totale imponibile</span>
            <span className="font-display text-2xl leading-tight font-bold tabular-nums">{formatOrderCurrency(totalImponibile)}</span>
          </div>
        </div>

        {showDeleteConfirm && (
          <div className={cn("border-t border-destructive/25 bg-destructive/5 py-4", inset)}>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">{deleteTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{deleteMessage}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(order.id)}
                    disabled={deleting}
                    className="w-full justify-center sm:w-auto"
                  >
                    {deleting ? (
                      <><Loader2 className="animate-spin" /> Operazione in corso…</>
                    ) : (
                      <><Trash2 /> {isUnsent ? (isPendingApproval ? "Sì, elimina ordine" : "Sì, elimina bozza") : "Sì, annulla ordine"}</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deleting}
                    className="w-full justify-center sm:w-auto"
                  >
                    Annulla
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {canEditOrder(order) && !showDeleteConfirm && (
          <div className={cn("flex flex-col gap-2 border-t border-border py-3.5 sm:flex-row sm:flex-wrap sm:justify-end", inset)}>
            {isCancelled ? (
              <Button
                variant="outline"
                onClick={() => handleRestore(order)}
                disabled={isRestoring}
                className="w-full justify-center text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 sm:w-auto dark:text-emerald-300 dark:hover:bg-emerald-900/20"
              >
                {isRestoring ? <><Loader2 className="animate-spin" /> Ripristino…</> : <><Undo2 /> Ripristina ordine</>}
              </Button>
            ) : hasAttachedDraft && !isUnsent ? (
              <Button
                variant="outline"
                onClick={() => handleDiscardDraft(order)}
                disabled={isSendingThisDraft || isDiscardingThisDraft || deleting}
                className="w-full justify-center text-amber-800 hover:bg-amber-50 hover:text-amber-800 sm:w-auto dark:text-amber-300 dark:hover:bg-amber-900/20"
              >
                {isDiscardingThisDraft ? <><Loader2 className="animate-spin" /> Scarto bozza…</> : <><Undo2 /> Scarta bozza</>}
              </Button>
            ) : null}
            {!isCancelled && (
              <>
                <Button
                  variant="destructive-soft"
                  onClick={() => setDeleteConfirm(order.id)}
                  disabled={isSendingThisDraft || isDiscardingThisDraft}
                  className="w-full justify-center sm:order-first sm:mr-auto sm:w-auto"
                >
                  <Trash2 />
                  {deleteActionLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleEdit(order)}
                  disabled={isSendingThisDraft || isDiscardingThisDraft}
                  className="w-full justify-center text-primary sm:w-auto"
                >
                  <Pencil />
                  {editActionLabel}
                </Button>
              </>
            )}
            {!isCancelled && canSendDraft && (
              <Button
                onClick={() => handleSendDraft(order)}
                disabled={isSendingThisDraft || isDiscardingThisDraft || deleting}
                className="w-full justify-center sm:w-auto"
              >
                {isSendingThisDraft ? <><Loader2 className="animate-spin" /> Invio bozza…</> : <><Send /> Invia bozza</>}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDraftChip = (order: Order) => {
    if (!order.hasDraft) return null;
    if (order.draftApprovalStatus === "in_approvazione") {
      return <Chip tone="orange"><Clock /> Modifica in approvazione</Chip>;
    }
    if (order.draftApprovalStatus === "rifiutato") {
      return <Chip tone="danger"><ShieldAlert /> Modifica rifiutata</Chip>;
    }
    return <Chip tone="warning-outline">Bozza aperta</Chip>;
  };

  const emptyState = (title: string, message: string) => (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
        <ClipboardList className="h-7 w-7 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6 pb-24 lg:max-w-[1200px] lg:px-10 lg:pt-8 lg:pb-8">
        <PageHeader
          eyebrow="Cronologia"
          title="Ordini"
          actions={
            <>
              <SegmentedTabs
                className="order-2 sm:w-64 lg:order-1"
                value={activeTab}
                onChange={setActiveTab}
                options={[
                  { value: "attivi", label: "Attivi", count: orderCounts.attivi },
                  { value: "annullati", label: "Annullati", count: orderCounts.annullati },
                ]}
              />
              <SearchField
                className="order-1 sm:flex-1 lg:order-2 lg:w-[360px] lg:flex-none"
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Numero, cliente, cantiere, agente"
                ariaLabel="Cerca ordini"
              />
            </>
          }
        />

        {orders.length === 0 ? (
          emptyState("Nessun ordine salvato", "Gli ordini salvati appariranno qui")
        ) : filteredOrders.length === 0 ? (
          emptyState(
            "Nessun ordine trovato",
            searchQuery.trim()
              ? "Prova a modificare i criteri di ricerca"
              : activeTab === "annullati"
                ? "Gli ordini annullati appariranno qui"
                : "Gli ordini attivi appariranno qui"
          )
        ) : (
          <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
            <section aria-label="Elenco ordini" className="flex flex-col gap-2.5">
              {filteredOrders.map((order) => {
                const isOpen = expanded === order.id;
                const isCancelled = order.status === "annullato";
                const totalQty = calculateOrderTotalPieces(order.items);
                const articleCount = countArticleLines(order.items);
                const totalImponibile = calculateOrderDiscountedTotal(order.items);
                return (
                  <article
                    key={order.id}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-card shadow-card transition-[border-color,box-shadow]",
                      isOpen ? "border-primary ring-4 ring-primary/10" : isCancelled ? "border-red-200 dark:border-red-900/60" : "border-border/80",
                      isCancelled && "bg-red-50/30 dark:bg-red-950/10"
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">
                            #{order.id} · {isCancelled && order.cancelledAt ? `annullato ${formatDate(order.cancelledAt)}` : formatDate(order.createdAt)}
                          </p>
                          <p className="mt-0.5 text-base leading-snug font-bold text-foreground">{order.cliente}</p>
                          {order.luogoConsegna && (
                            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{order.luogoConsegna}</span>
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-base font-bold whitespace-nowrap tabular-nums text-foreground">
                          {formatOrderCurrency(totalImponibile)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {getStatusChip(order.status)}
                        {renderDraftChip(order)}
                        <Chip><Warehouse /> {order.magazzino}</Chip>
                        {isAdmin && <span className="text-xs text-muted-foreground">{order.agenteFullName || order.agente}</span>}
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 border-t border-border/70 pt-2.5 text-[13px] text-muted-foreground">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                          {order.dataConsegna && (
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              Consegna {formatDeliveryShort(order.dataConsegna)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" />
                            {articleCount} art. · {totalQty} pz
                          </span>
                        </div>
                        <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform lg:hidden", isOpen && "rotate-180")} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border lg:hidden">
                        {renderOrderDetail(order, "px-4")}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            <section
              aria-label="Dettaglio ordine"
              className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-panel lg:block"
            >
              {selectedOrder ? (
                <>
                  <div className="px-6 pt-6 pb-4">
                    <p className="font-mono text-[13px] text-muted-foreground">Ordine #{selectedOrder.id}</p>
                    <h2 className="mt-1 font-display text-[28px] leading-tight font-bold tracking-tight text-foreground">{selectedOrder.cliente}</h2>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {getStatusChip(selectedOrder.status)}
                      {renderDraftChip(selectedOrder)}
                    </div>
                  </div>
                  {renderOrderDetail(selectedOrder, "px-6")}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
                    <ClipboardList className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground">Seleziona un ordine</p>
                  <p className="max-w-xs text-sm text-muted-foreground">Il dettaglio con righe, totali e azioni apparirà qui.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <Link
        href="/orders/new"
        className="no-print fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary pr-5 pl-4 text-[15px] font-semibold text-primary-foreground shadow-primary transition-colors hover:bg-primary-hover lg:hidden"
      >
        <Plus className="h-5 w-5" />
        Nuovo ordine
      </Link>
    </div>
  );
}

// Etichetta di stato con icona e colore
function getStatusChip(status: OrderStatus) {
  switch (status) {
    case "confermato":
      return <Chip tone="success" dot>Inviato</Chip>;
    case "bozza":
      return <Chip tone="warning" dot>Bozza</Chip>;
    case "in_approvazione":
      return <Chip tone="orange"><Clock /> In approvazione</Chip>;
    case "in_lavorazione":
      return <Chip tone="purple"><Package /> In lavorazione</Chip>;
    case "spedito":
      return <Chip tone="indigo"><Truck /> Spedito</Chip>;
    case "consegnato":
      return <Chip tone="success"><CheckCircle /> Consegnato</Chip>;
    case "annullato":
      return <Chip tone="danger"><XCircle /> Annullato</Chip>;
  }
}

function formatDeliveryShort(date: string) {
  return new Date(date).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function formatStatusLabel(status: OrderStatus) {
  switch (status) {
    case "bozza":
      return "Bozza";
    case "in_approvazione":
      return "In approvazione";
    case "confermato":
      return "Confermato";
    case "in_lavorazione":
      return "In lavorazione";
    case "spedito":
      return "Spedito";
    case "consegnato":
      return "Consegnato";
    case "annullato":
      return "Annullato";
  }
}
