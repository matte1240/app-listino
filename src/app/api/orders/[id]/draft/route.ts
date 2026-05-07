import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderUpdatedEmail } from "@/lib/mail";
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
import type { OrderHistoryItem } from "@/types";

async function getAuthorizedOrder(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const { id } = await paramsPromise;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return { error: NextResponse.json({ error: "ID non valido" }, { status: 400 }) };
  }

  const db = getDb();
  const order = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!order) {
    return { error: NextResponse.json({ error: "Ordine non trovato" }, { status: 404 }) };
  }

  if (payload.role !== "admin" && order.agente !== payload.username) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }) };
  }

  return { db, orderId, order, payload };
}

/** PUT /api/orders/[id]/draft — create or update the modification draft attached to an order */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await getAuthorizedOrder(req, params);
  if (authorized.error) return authorized.error;

  const { db, orderId, order } = authorized;
  if (resolveOrderStatus(order.status) === "bozza") {
    return NextResponse.json({ error: "Questa rotta è riservata alle bozze di modifica di ordini esistenti" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { clienteId, cliente, magazzino, luogoConsegna, dataConsegna, note, items } = body as {
    clienteId?: number | null;
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    dataConsegna: string;
    note: string;
    items: OrderHistoryItem[];
  };

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

  const orderWriteData: OrderWriteData = {
    cliente: resolvedCliente,
    clienteId: resolvedClienteId,
    magazzino,
    luogoConsegna: luogoConsegna ?? "",
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    items,
  };

  try {
    const savedDraft = upsertOrderDraft(db, orderId, orderWriteData);
    return NextResponse.json({
      draft: dbDraftToOrderDraft(savedDraft),
      order: dbOrderToOrder(order, { draftRow: savedDraft, includeDraft: true }),
    });
  } catch (error) {
    console.error("[orders] Errore salvataggio bozza modifica:", error);
    return NextResponse.json({ error: "Errore nel salvataggio della bozza" }, { status: 500 });
  }
}

/** POST /api/orders/[id]/draft — apply the current modification draft to the order */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await getAuthorizedOrder(req, params);
  if (authorized.error) return authorized.error;

  const { db, orderId, order, payload } = authorized;
  if (resolveOrderStatus(order.status) === "bozza") {
    return NextResponse.json({ error: "Questa rotta è riservata alle bozze di modifica di ordini esistenti" }, { status: 409 });
  }

  const draftRow = getOrderDraft(db, orderId);
  if (!draftRow) {
    return NextResponse.json({ error: "Bozza di modifica non trovata" }, { status: 404 });
  }

  const previousSnapshot = {
    cliente: order.cliente,
    magazzino: order.magazzino,
    luogoConsegna: order.luogo_consegna,
    dataConsegna: order.data_consegna,
    note: order.note,
    items: JSON.parse(order.items) as OrderHistoryItem[],
  };

  db.transaction(() => {
    db.prepare(
      `UPDATE orders
       SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?
       WHERE id = ?`
    ).run(
      draftRow.cliente,
      draftRow.cliente_id,
      draftRow.magazzino,
      draftRow.luogo_consegna,
      draftRow.data_consegna,
      draftRow.note,
      draftRow.items,
      orderId
    );

    deleteOrderDraft(db, orderId);
    db.prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'").run(orderId);
  })();

  const updatedOrder = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!updatedOrder) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const responseOrder = dbOrderToOrder(updatedOrder);
  sendOrderUpdatedEmail(responseOrder, previousSnapshot, payload.email).catch((err) =>
    console.error("[mail] Errore invio email modifica ordine:", err)
  );

  return NextResponse.json({ order: responseOrder });
}

/** DELETE /api/orders/[id]/draft — discard the current modification draft */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await getAuthorizedOrder(req, params);
  if (authorized.error) return authorized.error;

  const { db, orderId, order } = authorized;
  if (resolveOrderStatus(order.status) === "bozza") {
    return NextResponse.json({ error: "Questa rotta è riservata alle bozze di modifica di ordini esistenti" }, { status: 409 });
  }

  const deleted = deleteOrderDraft(db, orderId);
  if (deleted === 0) {
    return NextResponse.json({ error: "Bozza di modifica non trovata" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}