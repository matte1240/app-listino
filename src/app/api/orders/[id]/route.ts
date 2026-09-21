import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail, sendOrderUpdatedEmail, sendOrderCancelledEmail } from "@/lib/mail";
import {
  dbDraftToOrderDraft,
  dbOrderToOrder,
  deleteOrderDraft,
  getDbOrder,
  getOrderDraft,
  isUnsentOrderStatus,
  parseOrderItems,
  resolveOrderStatus,
  upsertOrderDraft,
  type DbOrder,
  type OrderWriteData,
} from "@/lib/orders";
import { getDbQuotation, markQuotationConverted, type DbQuotation } from "@/lib/quotations";
import { userOwnsCustomerByRap } from "@/lib/rap";
import { countArticleLines, itemsRequireApproval, normalizeOrderItems } from "@/lib/order-lines";
import { getLineCodes } from "@/lib/settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { getApprovedQuotationItems, quotationUnavailableReason, resolveOrderSubmitState } from "@/lib/approvals";
import { notifyAdminsApprovalRequested, orderApprovalDoc } from "@/lib/notifications";
import type { OrderStatus } from "@/types";

function canManageOrder(
  db: ReturnType<typeof getDb>,
  payload: { id: number; username: string; role: "admin" | "agente" },
  order: { agente: string; cliente_id: number | null }
): boolean {
  if (payload.role === "admin") return true;
  if (order.agente === payload.username) return true;
  return userOwnsCustomerByRap(db, payload.id, order.cliente_id);
}

/** GET /api/orders/[id] — get single order */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const row = getDbOrder(db, orderId);
  if (!row) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  if (!canManageOrder(db, payload, row)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const rowStatus = resolveOrderStatus(row.status);
  const draftRow = !isUnsentOrderStatus(rowStatus) && row.parent_order_id === null ? getOrderDraft(db, orderId) ?? null : null;

  return NextResponse.json({ order: dbOrderToOrder(row, { draftRow, includeDraft: true }) });
}

/** PUT /api/orders/[id] — update an existing order */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const existing = getDbOrder(db, orderId);
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  if (!canManageOrder(db, payload, existing)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { clienteId, cliente, magazzino, luogoConsegna, dataConsegna, note, items: rawItems, status } = body as {
    clienteId?: number | null;
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    dataConsegna: string;
    note: string;
    items: unknown;
    status?: "bozza" | "confermato";
  };

  const requestedStatus: "bozza" | "confermato" = status === "bozza" ? "bozza" : "confermato";
  const items = normalizeOrderItems(rawItems, getLineCodes());

  const normalizedClienteId = Number(clienteId);
  const hasSelectedCustomer = Number.isInteger(normalizedClienteId) && normalizedClienteId > 0;

  let resolvedClienteId: number | null = null;
  let resolvedCliente = cliente?.trim() ?? "";

  if (hasSelectedCustomer) {
    const selectedCustomer = db
      .prepare("SELECT id, ragione_sociale FROM anagrafiche WHERE id = ?")
      .get(normalizedClienteId) as { id: number; ragione_sociale: string } | undefined;

    if (!selectedCustomer) {
      return NextResponse.json({ error: "Cliente anagrafica non trovato" }, { status: 400 });
    }

    resolvedClienteId = selectedCustomer.id;
    resolvedCliente = selectedCustomer.ragione_sociale;
  }

  if (!resolvedCliente || !magazzino?.trim() || countArticleLines(items) === 0) {
    return NextResponse.json({ error: "Dati ordine incompleti" }, { status: 400 });
  }

  const existingStatus = resolveOrderStatus(existing.status);
  if (existingStatus === "annullato") {
    return NextResponse.json({ error: "L'ordine annullato non può essere modificato" }, { status: 409 });
  }
  const existingParentOrderId = existing.parent_order_id ?? null;
  const isLinkedDraft = existingStatus === "bozza" && existingParentOrderId !== null;
  /** Ordine mai inviato al magazzino: bozza o in attesa di approvazione. */
  const isUnsent = isUnsentOrderStatus(existingStatus) && existingParentOrderId === null;
  const isConfirmedOrder = !isLinkedDraft && !isUnsent;
  const orderWriteData: OrderWriteData = {
    cliente: resolvedCliente,
    clienteId: resolvedClienteId,
    magazzino,
    luogoConsegna: luogoConsegna ?? "",
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    items,
  };
  const baseUrl = getAppBaseUrl(req);

  // Ordine confermato + "Salva bozza": bozza di modifica (un nuovo salvataggio ritira l'eventuale approvazione pendente).
  if (isConfirmedOrder && requestedStatus === "bozza") {
    try {
      const savedDraft = upsertOrderDraft(db, orderId, orderWriteData, { approvalStatus: null });
      return NextResponse.json({
        order: dbOrderToOrder(existing, { draftRow: savedDraft, includeDraft: true }),
        draft: dbDraftToOrderDraft(savedDraft),
      });
    } catch (error) {
      console.error("[orders] Errore salvataggio bozza modifica:", error);
      return NextResponse.json({ error: "Errore nel salvataggio della bozza" }, { status: 500 });
    }
  }

  // Ordine confermato + "Invia modifica" con sconti liberi: la modifica resta in bozza in attesa dell'admin.
  if (isConfirmedOrder && requestedStatus === "confermato" && itemsRequireApproval(items) && payload.role !== "admin") {
    const savedDraft = upsertOrderDraft(db, orderId, orderWriteData, { approvalStatus: "in_approvazione" });
    const orderWithDraft = dbOrderToOrder(existing, { draftRow: savedDraft, includeDraft: true });
    notifyAdminsApprovalRequested(db, orderApprovalDoc(orderWithDraft, baseUrl, "modifica", items)).catch((err) =>
      console.error("[approvazioni] Errore notifica admin:", err)
    );
    return NextResponse.json({ order: orderWithDraft, draft: dbDraftToOrderDraft(savedDraft), pendingApproval: true });
  }

  if (isLinkedDraft && requestedStatus === "confermato") {
    const parentId = existingParentOrderId as number;
    const parent = getDbOrder(db, parentId);
    if (!parent) {
      return NextResponse.json({ error: "Ordine principale non trovato" }, { status: 409 });
    }
    if (!canManageOrder(db, payload, parent)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const previousSnapshot = {
      cliente: parent.cliente,
      magazzino: parent.magazzino,
      luogoConsegna: parent.luogo_consegna,
      dataConsegna: parent.data_consegna,
      note: parent.note,
      items: parseOrderItems(parent.items),
    };

    db.transaction(() => {
      db.prepare(
        `UPDATE orders
         SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, status = ?, parent_order_id = ?, updated_at = datetime('now'), cancelled_at = NULL, cancelled_by = NULL, cancelled_from_status = NULL
         WHERE id = ?`
      ).run(
        resolvedCliente,
        resolvedClienteId,
        magazzino,
        luogoConsegna ?? "",
        dataConsegna ?? "",
        note ?? "",
        JSON.stringify(items),
        parent.status,
        null,
        parentId
      );

      db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    })();

    const updatedParent = getDbOrder(db, parentId);
    if (!updatedParent) {
      return NextResponse.json({ error: "Ordine principale non trovato" }, { status: 500 });
    }

    const order = dbOrderToOrder(updatedParent);
    sendOrderUpdatedEmail(order, previousSnapshot, payload.email).catch((err) =>
      console.error("[mail] Errore invio email modifica ordine:", err)
    );

    return NextResponse.json({ order, appliedDraftId: orderId });
  }

  const previousSnapshot = {
    cliente: existing.cliente,
    magazzino: existing.magazzino,
    luogoConsegna: existing.luogo_consegna,
    dataConsegna: existing.data_consegna,
    note: existing.note,
    items: parseOrderItems(existing.items),
  };
  const nextParentOrderId = isLinkedDraft ? existingParentOrderId : null;

  // Stato e campi di approvazione dopo il salvataggio.
  let nextStatus: OrderStatus = existing.status as OrderStatus;
  let approvalRequestedAt = existing.approval_requested_at;
  let approvalDecidedAt = existing.approval_decided_at;
  let approvalDecidedBy = existing.approval_decided_by;
  let approvalNote = existing.approval_note;
  let sourceQuotation: DbQuotation | undefined;

  if (isLinkedDraft) {
    nextStatus = requestedStatus;
  } else if (isUnsent) {
    if (requestedStatus === "bozza") {
      // Ritiro: torna (o resta) in bozza; l'eventuale motivazione di rifiuto resta visibile all'agente.
      nextStatus = "bozza";
      approvalRequestedAt = null;
    } else {
      if (existing.quotation_id !== null) {
        sourceQuotation = getDbQuotation(db, existing.quotation_id);
        if (!sourceQuotation) {
          return NextResponse.json({ error: "Preventivo non trovato" }, { status: 409 });
        }
        const reason = quotationUnavailableReason(sourceQuotation.status);
        if (reason) return NextResponse.json({ error: reason }, { status: 409 });
      }
      const submitState = resolveOrderSubmitState({
        items,
        user: payload,
        sourceQuotationItems: getApprovedQuotationItems(sourceQuotation),
      });
      nextStatus = submitState.status;
      approvalRequestedAt = submitState.approvalRequestedAt;
      approvalDecidedAt = submitState.approvalDecidedAt;
      approvalDecidedBy = submitState.approvalDecidedBy;
      approvalNote = null;
    }
  }

  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE orders
         SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, status = ?, parent_order_id = ?,
             approval_requested_at = ?, approval_decided_at = ?, approval_decided_by = ?, approval_note = ?,
             updated_at = datetime('now'), cancelled_at = NULL, cancelled_by = NULL, cancelled_from_status = NULL
         WHERE id = ?`
      ).run(
        resolvedCliente,
        resolvedClienteId,
        magazzino,
        luogoConsegna ?? "",
        dataConsegna ?? "",
        note ?? "",
        JSON.stringify(items),
        nextStatus,
        nextParentOrderId,
        approvalRequestedAt,
        approvalDecidedAt,
        approvalDecidedBy,
        approvalNote,
        orderId
      );

      if (isConfirmedOrder) {
        deleteOrderDraft(db, orderId);
        db.prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'").run(orderId);
      }

      if (isUnsent && nextStatus === "confermato" && existing.quotation_id !== null) {
        const convertedChanges = markQuotationConverted(db, existing.quotation_id, orderId);
        if (convertedChanges === 0) throw new Error("QUOTATION_UNAVAILABLE");
      }
    })();
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTATION_UNAVAILABLE") {
      return NextResponse.json({ error: quotationUnavailableReason(sourceQuotation?.status) ?? "Preventivo non disponibile" }, { status: 409 });
    }
    throw error;
  }

  const updated = getDbOrder(db, orderId);
  if (!updated) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const order = dbOrderToOrder(updated);

  if (isUnsent && nextStatus === "confermato") {
    sendOrderEmail(order, payload.email).catch((err) =>
      console.error("[mail] Errore invio email ordine:", err)
    );
  } else if (isUnsent && nextStatus === "in_approvazione") {
    // Nuova richiesta o righe cambiate rispetto alla richiesta precedente: avvisa gli admin.
    const itemsChanged = existing.items !== JSON.stringify(items);
    if (existingStatus !== "in_approvazione" || itemsChanged) {
      notifyAdminsApprovalRequested(db, orderApprovalDoc(order, baseUrl)).catch((err) =>
        console.error("[approvazioni] Errore notifica admin:", err)
      );
    }
  } else if (isConfirmedOrder && requestedStatus === "confermato") {
    sendOrderUpdatedEmail(order, previousSnapshot, payload.email).catch((err) =>
      console.error("[mail] Errore invio email modifica ordine:", err)
    );
  }

  return NextResponse.json({ order });
}

/** DELETE /api/orders/[id] — delete order (owner or admin) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const existing: DbOrder | undefined = getDbOrder(db, orderId);
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  if (!canManageOrder(db, payload, existing)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const order = dbOrderToOrder(existing);
  // Bozze e ordini in attesa di approvazione non sono mai arrivati al magazzino: eliminazione definitiva senza email.
  const isDraft = isUnsentOrderStatus(order.status);
  if (order.status === "annullato") {
    return NextResponse.json({ error: "L'ordine è già annullato" }, { status: 409 });
  }
  const shouldSendCancellationEmail = !isDraft && order.parentOrderId === null;

  const txResult = db.transaction(() => {
    const attachedDraftChanges = deleteOrderDraft(db, orderId);
    const legacyLinkedDraftsDelete = db
      .prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'")
      .run(orderId);

    if (isDraft) {
      const orderDelete = db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);

      return {
        orderChanges: orderDelete.changes,
        linkedDraftChanges: attachedDraftChanges + legacyLinkedDraftsDelete.changes,
        cancelled: false,
      };
    }

    const orderCancel = db.prepare(
      `UPDATE orders
       SET status = 'annullato', updated_at = datetime('now'), cancelled_at = datetime('now'), cancelled_by = ?, cancelled_from_status = status
       WHERE id = ?`
    ).run(payload.username, orderId);

    return {
      orderChanges: orderCancel.changes,
      linkedDraftChanges: attachedDraftChanges + legacyLinkedDraftsDelete.changes,
      cancelled: true,
    };
  })();

  if (txResult.orderChanges === 0) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  if (!shouldSendCancellationEmail) {
    return NextResponse.json({ ok: true, cancelled: txResult.cancelled, deletedLinkedDrafts: txResult.linkedDraftChanges, cancellationEmailSent: false });
  }

  sendOrderCancelledEmail(order, payload.email).catch((err) =>
    console.error("[mail] Errore invio email cancellazione ordine:", err)
  );

  return NextResponse.json({ ok: true, cancelled: txResult.cancelled, deletedLinkedDrafts: txResult.linkedDraftChanges, cancellationEmailSent: true });
}
