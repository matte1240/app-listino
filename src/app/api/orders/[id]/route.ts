import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail, sendOrderUpdatedEmail, sendOrderCancelledEmail } from "@/lib/mail";
import {
  dbDraftToOrderDraft,
  dbOrderToOrder,
  deleteOrderDraft,
  getOrderDraft,
  resolveOrderStatus,
  upsertOrderDraft,
  type DbOrder,
  type OrderWriteData,
} from "@/lib/orders";
import { getDbQuotation, markQuotationConverted } from "@/lib/quotations";
import type { OrderHistoryItem } from "@/types";

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
  const row = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!row) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  if (payload.role !== "admin" && row.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const rowStatus = resolveOrderStatus(row.status);
  const draftRow = rowStatus !== "bozza" && row.parent_order_id === null ? getOrderDraft(db, orderId) ?? null : null;

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
  const existing = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { clienteId, cliente, magazzino, luogoConsegna, dataConsegna, note, items, status } = body as {
    clienteId?: number | null;
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    dataConsegna: string;
    note: string;
    items: OrderHistoryItem[];
    status?: "bozza" | "confermato";
  };

  const resolvedStatus: "bozza" | "confermato" = status === "bozza" ? "bozza" : "confermato";

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

  if (!resolvedCliente || !magazzino?.trim() || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Dati ordine incompleti" }, { status: 400 });
  }

  const existingStatus = resolveOrderStatus(existing.status);
  const existingParentOrderId = existing.parent_order_id ?? null;
  const isLinkedDraft = existingStatus === "bozza" && existingParentOrderId !== null;
  const isStandaloneDraft = existingStatus === "bozza" && existingParentOrderId === null;
  const orderWriteData: OrderWriteData = {
    cliente: resolvedCliente,
    clienteId: resolvedClienteId,
    magazzino,
    luogoConsegna: luogoConsegna ?? "",
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    items,
  };

  if (!isLinkedDraft && !isStandaloneDraft && resolvedStatus === "bozza") {
    try {
      const savedDraft = upsertOrderDraft(db, orderId, orderWriteData);
      return NextResponse.json({
        order: dbOrderToOrder(existing, { draftRow: savedDraft, includeDraft: true }),
        draft: dbDraftToOrderDraft(savedDraft),
      });
    } catch (error) {
      console.error("[orders] Errore salvataggio bozza modifica:", error);
      return NextResponse.json({ error: "Errore nel salvataggio della bozza" }, { status: 500 });
    }
  }

  if (isLinkedDraft && resolvedStatus === "confermato") {
    const parentId = existingParentOrderId as number;
    const parent = db.prepare(
      `SELECT orders.*, users.full_name AS agente_full_name
       FROM orders
       LEFT JOIN users ON users.username = orders.agente
       WHERE orders.id = ?`
    ).get(parentId) as DbOrder | undefined;
    if (!parent) {
      return NextResponse.json({ error: "Ordine principale non trovato" }, { status: 409 });
    }
    if (payload.role !== "admin" && parent.agente !== payload.username) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const previousSnapshot = {
      cliente: parent.cliente,
      magazzino: parent.magazzino,
      luogoConsegna: parent.luogo_consegna,
      dataConsegna: parent.data_consegna,
      note: parent.note,
      items: JSON.parse(parent.items) as OrderHistoryItem[],
    };

    db.transaction(() => {
      db.prepare(
        `UPDATE orders
         SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, status = ?, parent_order_id = ?
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

    const updatedParent = db.prepare(
      `SELECT orders.*, users.full_name AS agente_full_name
       FROM orders
       LEFT JOIN users ON users.username = orders.agente
       WHERE orders.id = ?`
    ).get(parentId) as DbOrder | undefined;
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
    items: JSON.parse(existing.items) as OrderHistoryItem[],
  };
  const nextParentOrderId = isLinkedDraft ? existingParentOrderId : null;
  const nextStatus = isStandaloneDraft || isLinkedDraft ? resolvedStatus : existing.status;

  if (isStandaloneDraft && resolvedStatus === "confermato" && existing.quotation_id !== null) {
    const sourceQuotation = getDbQuotation(db, existing.quotation_id);
    if (!sourceQuotation) {
      return NextResponse.json({ error: "Preventivo non trovato" }, { status: 409 });
    }
    if (sourceQuotation.status === "convertito") {
      return NextResponse.json({ error: "Preventivo già trasformato in ordine" }, { status: 409 });
    }
  }

  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE orders
         SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, status = ?, parent_order_id = ?
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
        orderId
      );

      if (!isStandaloneDraft && !isLinkedDraft) {
        deleteOrderDraft(db, orderId);
        db.prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'").run(orderId);
      }

      if (isStandaloneDraft && resolvedStatus === "confermato" && existing.quotation_id !== null) {
        const convertedChanges = markQuotationConverted(db, existing.quotation_id, orderId);
        if (convertedChanges === 0) throw new Error("QUOTATION_ALREADY_CONVERTED");
      }
    })();
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTATION_ALREADY_CONVERTED") {
      return NextResponse.json({ error: "Preventivo già trasformato in ordine" }, { status: 409 });
    }
    throw error;
  }

  const updated = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!updated) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const order = dbOrderToOrder(updated);

  if (resolvedStatus === "confermato") {
    if (isStandaloneDraft) {
      sendOrderEmail(order, payload.email).catch((err) =>
        console.error("[mail] Errore invio email ordine:", err)
      );
    } else if (!isLinkedDraft) {
      sendOrderUpdatedEmail(order, previousSnapshot, payload.email).catch((err) =>
        console.error("[mail] Errore invio email modifica ordine:", err)
      );
    }
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
  const existing = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const order = dbOrderToOrder(existing);
  const shouldSendCancellationEmail = order.status !== "bozza" && order.parentOrderId === null;

  const txResult = db.transaction(() => {
    const attachedDraftChanges = deleteOrderDraft(db, orderId);
    const legacyLinkedDraftsDelete = db
      .prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'")
      .run(orderId);
    const orderDelete = db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);

    return {
      orderChanges: orderDelete.changes,
      linkedDraftChanges: attachedDraftChanges + legacyLinkedDraftsDelete.changes,
    };
  })();

  if (txResult.orderChanges === 0) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  if (!shouldSendCancellationEmail) {
    return NextResponse.json({ ok: true, deletedLinkedDrafts: txResult.linkedDraftChanges, cancellationEmailSent: false });
  }

  sendOrderCancelledEmail(order, payload.email).catch((err) =>
    console.error("[mail] Errore invio email cancellazione ordine:", err)
  );

  return NextResponse.json({ ok: true, deletedLinkedDrafts: txResult.linkedDraftChanges, cancellationEmailSent: true });
}
