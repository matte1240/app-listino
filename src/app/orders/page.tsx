"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { countArticleLines, getOrderIncompleteReason } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, formatOrderCurrency, formatOrderQuantitiesByUnit } from "@/lib/order-totals";
import type { Order, OrderStatus } from "@/types";

type OrderTab = "attivi" | "annullati";

/** Da lg il dettaglio è nel pannello laterale ed è l'elenco a scorrere, sotto è la pagina. */
const MASTER_DETAIL_QUERY = "(min-width: 64rem)";

/** Altezza utile della pagina: la shell aggiunge già barra superiore e tab bar (0 da lg). */
const PAGE_MIN_H = "min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))]";

export default function OrdersPage() {
  // useSearchParams (apertura diretta con ?open=<id>) richiede un confine Suspense.
  return (
    <Suspense fallback={<PageLoader />}>
      <OrdersPageContent />
    </Suspense>
  );
}

function PageLoader() {
  return (
    <div className={cn(PAGE_MIN_H, "flex items-center justify-center")}>
      <p className="text-muted-foreground">Caricamento…</p>
    </div>
  );
}

function OrdersPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  /** Scheda a cui appartiene `orders`: finché non coincide con quella attiva l'elenco mostra il caricamento. */
  const [ordersTab, setOrdersTab] = useState<OrderTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<number | null>(null);
  const [discardingDraftId, setDiscardingDraftId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<OrderTab>("attivi");
  const [orderCounts, setOrderCounts] = useState({ attivi: 0, annullati: 0 });
  const loadSeqRef = useRef(0);
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const prevTabRef = useRef(activeTab);
  /** Ordine da portare in vista appena espanso (apertura con ?open=<id>). */
  const pendingScrollRef = useRef<number | null>(null);
  /** Richiesta ?open=<id> in corso: schede già controllate e se è stata gestita (il parametro sparisce in modo asincrono). */
  const openRequestRef = useRef<{ id: number | null; triedTabs: OrderTab[]; done: boolean }>({ id: null, triedTabs: [], done: false });

  const openParam = searchParams.get("open");
  const openId = openParam && /^\d+$/.test(openParam) ? Number(openParam) : null;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadOrders(activeTab);
    }
  }, [activeTab, authLoading, user]);

  // Cambio scheda (anche automatico dopo annullamento o ripristino): l'elenco riparte dall'inizio.
  useEffect(() => {
    if (prevTabRef.current === activeTab) return;
    prevTabRef.current = activeTab;
    window.scrollTo({ top: 0 });
    listRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  // Apertura diretta da /orders?open=<id> (es. "Apri ordine" di un preventivo trasformato): espande
  // l'ordine, cercandolo anche tra gli annullati, poi toglie il parametro dall'indirizzo.
  useEffect(() => {
    const request = openRequestRef.current;
    if (request.id !== openId) Object.assign(request, { id: openId, triedTabs: [], done: false });
    if (openId === null || request.done || loading || ordersTab !== activeTab) return;
    if (orders.some((order) => order.id === openId)) {
      pendingScrollRef.current = openId;
      setSearchQuery("");
      setExpanded(openId);
    } else {
      request.triedTabs.push(activeTab);
      const otherTab: OrderTab = activeTab === "attivi" ? "annullati" : "attivi";
      if (!request.triedTabs.includes(otherTab)) {
        setActiveTab(otherTab);
        return;
      }
      toast.error(`Ordine #${openId} non trovato`);
      setActiveTab(request.triedTabs[0]);
    }
    request.done = true;
    router.replace("/orders", { scroll: false });
  }, [openId, loading, ordersTab, activeTab, orders, router]);

  useEffect(() => {
    if (expanded === null || pendingScrollRef.current !== expanded) return;
    pendingScrollRef.current = null;
    scrollOrderIntoView(expanded, listRef.current, stickyBarRef.current);
  }, [expanded]);

  // Rotazione con un ordine aperto: il dettaglio passa dal pannello laterale alla card espansa
  // (o viceversa), quindi la card torna in vista invece di restare fuori schermo.
  useEffect(() => {
    if (expanded === null) return;
    const media = window.matchMedia(MASTER_DETAIL_QUERY);
    const onChange = () => requestAnimationFrame(() => scrollOrderIntoView(expanded, listRef.current, stickyBarRef.current));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [expanded]);

  async function loadOrders(tab: OrderTab) {
    // Le schede restano cliccabili durante il caricamento: vale solo la risposta dell'ultima richiesta.
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?status=${tab}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (seq !== loadSeqRef.current) return;
        setOrders(data.orders ?? []);
        setOrderCounts(data.counts ?? { attivi: 0, annullati: 0 });
        setOrdersTab(tab);
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setLoadedOnce(true);
      }
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
        toast.error("Errore nella cancellazione dell'ordine");
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
        toast.error("Errore durante il ripristino dell'ordine");
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

    // Bozza incompleta (es. magazzino non ancora scelto): si completa nella modifica, non si invia.
    const incompleteReason = isStandaloneDraft ? getOrderIncompleteReason(order, "confermato") : null;
    if (incompleteReason) {
      toast.error(incompleteReason, {
        description: "Completa la bozza prima di inviarla.",
        action: { label: "Modifica", onClick: () => handleEdit(order) },
      });
      return;
    }

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
        toast.error("Errore durante lo scarto della bozza");
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

  // Caricamento a pagina intera solo la prima volta: poi titolo, schede e ricerca restano montati.
  if (authLoading || (loading && !loadedOnce)) {
    return <PageLoader />;
  }

  const isAdmin = user?.role === "admin";
  const selectedOrder = filteredOrders.find((order) => order.id === expanded) ?? null;
  const listLoading = loading && ordersTab !== activeTab;

  /** Dettaglio ordine: in linea sotto la card su mobile, nel pannello laterale su desktop. */
  const renderOrderDetail = (order: Order, inset: string) => {
    const quantities = formatOrderQuantitiesByUnit(order.items);
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
      { label: "Magazzino", value: order.magazzino || <span className="text-muted-foreground">Da scegliere</span> },
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

    // Container query: il layout segue la larghezza del dettaglio (card espansa o pannello laterale), non del viewport.
    return (
      <div className="@container flex flex-col">
        <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 bg-muted/50 py-3.5 @xl:grid-cols-4", inset)}>
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
            <span className="min-w-0 wrap-anywhere"><strong className="font-bold">Note:</strong> {order.note}</span>
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

        <div className={cn("flex flex-wrap items-end justify-end gap-x-8 gap-y-2 py-4", inset)}>
          {quantities && (
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Quantità</span>
              <span className="text-base font-bold tabular-nums">{quantities}</span>
            </div>
          )}
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
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">{deleteTitle}</p>
                <p className="mt-1 text-xs wrap-break-word text-muted-foreground">{deleteMessage}</p>
                <div className="mt-3 flex flex-col gap-2 @sm:flex-row @sm:flex-wrap">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(order.id)}
                    disabled={deleting}
                    className="w-full justify-center @sm:w-auto"
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
                    className="w-full justify-center @sm:w-auto"
                  >
                    Annulla
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {canEditOrder(order) && !showDeleteConfirm && (
          <div className={cn("grid grid-cols-2 gap-2 border-t border-border py-3.5 @xl:flex @xl:flex-row @xl:flex-wrap @xl:justify-end", inset)}>
            {isCancelled ? (
              <Button
                variant="outline"
                onClick={() => handleRestore(order)}
                disabled={isRestoring}
                className="col-span-2 w-full justify-center text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 @xl:w-auto dark:text-emerald-300 dark:hover:bg-emerald-900/20"
              >
                {isRestoring ? <><Loader2 className="animate-spin" /> Ripristino…</> : <><Undo2 /> Ripristina ordine</>}
              </Button>
            ) : hasAttachedDraft && !isUnsent ? (
              <Button
                variant="outline"
                onClick={() => handleDiscardDraft(order)}
                disabled={isSendingThisDraft || isDiscardingThisDraft || deleting}
                className="col-span-2 w-full justify-center text-amber-800 hover:bg-amber-50 hover:text-amber-800 @xl:w-auto dark:text-amber-300 dark:hover:bg-amber-900/20"
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
                  className="w-full justify-center @xl:order-first @xl:mr-auto @xl:w-auto"
                >
                  <Trash2 />
                  {deleteActionLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleEdit(order)}
                  disabled={isSendingThisDraft || isDiscardingThisDraft}
                  className="w-full justify-center text-primary @xl:w-auto"
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
                className="col-span-2 w-full justify-center @xl:w-auto"
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
    <div className={cn(PAGE_MIN_H, "bg-background")}>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-24 lg:h-dvh lg:max-w-[1200px] lg:gap-6 lg:px-10 lg:pb-0">
        {/* Titolo, schede e ricerca restano visibili: sticky su mobile, fissi su desktop (scorrono elenco e dettaglio) */}
        <div ref={stickyBarRef} className="sticky top-[var(--app-header-h)] z-20 -mx-4 border-b border-border/70 bg-background px-4 pt-5 pb-3 lg:static lg:mx-0 lg:border-0 lg:px-0 lg:pt-8 lg:pb-0">
          <PageHeader
            className="gap-3"
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
                {/* Da lg larga fino a 360px ma restringibile: accanto al titolo anche a 1024px */}
                <SearchField
                  className="order-1 sm:flex-1 lg:order-2 lg:w-0 lg:max-w-[360px] lg:min-w-48"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Numero, cliente, cantiere, agente"
                  ariaLabel="Cerca ordini"
                />
              </>
            }
          />
        </div>

        {listLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
          </div>
        ) : orders.length === 0 ? (
          activeTab === "annullati"
            ? emptyState("Nessun ordine annullato", "Gli ordini annullati appariranno qui")
            : emptyState("Nessun ordine salvato", "Gli ordini salvati appariranno qui")
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
          <div
            aria-busy={loading}
            className={cn(
              "grid grid-cols-1 gap-6 transition-opacity lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]",
              loading && "pointer-events-none opacity-60"
            )}
          >
            <section ref={listRef} aria-label="Elenco ordini" className="flex min-w-0 flex-col gap-2.5 lg:-mx-1.5 lg:overflow-y-auto lg:px-1.5 lg:pt-1.5 lg:pb-8">
              {filteredOrders.map((order) => {
                const isOpen = expanded === order.id;
                const isCancelled = order.status === "annullato";
                const quantities = formatOrderQuantitiesByUnit(order.items);
                const articleCount = countArticleLines(order.items);
                const totalImponibile = calculateOrderDiscountedTotal(order.items);
                return (
                  <article
                    key={order.id}
                    data-order-id={order.id}
                    className={cn(
                      "shrink-0 overflow-hidden rounded-xl border bg-card shadow-card transition-[border-color,box-shadow]",
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
                            #{order.id} · {isCancelled && order.cancelledAt ? <>annullato <span className="whitespace-nowrap">{formatDate(order.cancelledAt)}</span></> : <span className="whitespace-nowrap">{formatDate(order.createdAt)}</span>}
                          </p>
                          <p className="mt-0.5 text-base leading-snug font-bold wrap-anywhere text-foreground">{order.cliente}</p>
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
                        {order.magazzino && <Chip><Warehouse /> {order.magazzino}</Chip>}
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
                            {articleCount} art.{quantities && ` · ${quantities}`}
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
              className="@container hidden max-h-[calc(100%-2rem)] self-start overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-panel lg:mt-1.5 lg:block"
            >
              {selectedOrder ? (
                <>
                  <div className="px-6 pt-6 pb-4">
                    <p className="font-mono text-[13px] text-muted-foreground">Ordine #{selectedOrder.id}</p>
                    <h2 className="mt-1 font-display text-[22px] leading-tight font-bold tracking-tight wrap-anywhere text-foreground @md:text-[28px]">{selectedOrder.cliente}</h2>
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

      {/* Nascosto con un ordine espanso: coprirebbe totali e azioni della card in basso a destra */}
      {!selectedOrder && (
        <Link
          href="/orders/new"
          className="no-print fixed right-4 bottom-[calc(var(--app-tabbar-h)+0.75rem)] z-30 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary pr-5 pl-4 text-[15px] font-semibold text-primary-foreground shadow-primary transition-colors hover:bg-primary-hover lg:hidden"
        >
          <Plus className="h-5 w-5" />
          Nuovo ordine
        </Link>
      )}
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

/**
 * Porta in vista la card di un ordine: da lg scorre l'elenco laterale (solo se la card non è già visibile),
 * sotto scorre la pagina fino a mettere la card subito sotto la barra sticky di titolo, schede e ricerca.
 */
function scrollOrderIntoView(id: number, list: HTMLElement | null, stickyBar: HTMLElement | null) {
  const card = list?.querySelector<HTMLElement>(`[data-order-id="${id}"]`);
  if (!list || !card) return;
  const cardRect = card.getBoundingClientRect();
  if (window.matchMedia(MASTER_DETAIL_QUERY).matches) {
    const listRect = list.getBoundingClientRect();
    if (cardRect.top >= listRect.top && cardRect.bottom <= listRect.bottom) return;
    list.scrollTo({ top: list.scrollTop + cardRect.top - listRect.top - 8 });
    return;
  }
  const barBottom = stickyBar?.getBoundingClientRect().bottom ?? 0;
  window.scrollTo({ top: window.scrollY + cardRect.top - barBottom - 12 });
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
      return "Inviato";
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
