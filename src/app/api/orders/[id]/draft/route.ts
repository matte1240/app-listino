import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderUpdatedEmail } from "@/lib/mail";
import {
  applyOrderDraft,
  dbDraftToOrderDraft,
  dbOrderToOrder,
  deleteOrderDraft,
  getDbOrder,
  getOrderDraft,
  isUnsentOrderStatus,
  parseOrderItems,
  resolveOrderStatus,
  upsertOrderDraft,
  type OrderWriteData,
} from "@/lib/orders";
import { userOwnsCustomerByRap } from "@/lib/rap";
import { getOrderIncompleteReason, itemsRequireApproval, normalizeOrderItems } from "@/lib/order-lines";
import { getLineCodes } from "@/lib/settings";
import { normalizeCig, normalizeCup } from "@/lib/cig-cup";
import { getAppBaseUrl } from "@/lib/app-url";
import { notifyAdminsApprovalRequested, orderApprovalDoc } from "@/lib/notifications";

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
  const order = getDbOrder(db, orderId);
  if (!order) {
    return { error: NextResponse.json({ error: "Ordine non trovato" }, { status: 404 }) };
  }

  if (payload.role !== "admin" && order.agente !== payload.username && !userOwnsCustomerByRap(db, payload.id, order.cliente_id)) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }) };
  }

  return { db, orderId, order, payload };
}

const DRAFT_ROUTE_ERROR = "Questa rotta è riservata alle bozze di modifica di ordini già inviati";

/** PUT /api/orders/[id]/draft — create or update the modification draft attached to an order */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await getAuthorizedOrder(req, params);
  if (authorized.error) return authorized.error;

  const { db, orderId, order } = authorized;
  if (isUnsentOrderStatus(resolveOrderStatus(order.status))) {
    return NextResponse.json({ error: DRAFT_ROUTE_ERROR }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { clienteId, cliente, magazzino, luogoConsegna, cig, cup, dataConsegna, note, items: rawItems } = body as {
    clienteId?: number | null;
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    cig?: string;
    cup?: string;
    dataConsegna: string;
    note: string;
    items: unknown;
  };
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

  // Bozza di modifica: basta cliente + articoli; magazzino e CIG/CUP si verificano quando la si applica (POST).
  const resolvedMagazzino = typeof magazzino === "string" ? magazzino.trim() : "";
  const normalizedCig = normalizeCig(cig);
  const normalizedCup = normalizeCup(cup);
  const incompleteReason = getOrderIncompleteReason(
    { cliente: resolvedCliente, magazzino: resolvedMagazzino, cig: normalizedCig, cup: normalizedCup, items },
    "bozza"
  );
  if (incompleteReason) {
    return NextResponse.json({ error: incompleteReason }, { status: 400 });
  }

  const orderWriteData: OrderWriteData = {
    cliente: resolvedCliente,
    clienteId: resolvedClienteId,
    magazzino: resolvedMagazzino,
    luogoConsegna: luogoConsegna ?? "",
    cig: normalizedCig,
    cup: normalizedCup,
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    items,
  };

  try {
    // Un nuovo salvataggio ritira l'eventuale richiesta di approvazione pendente sulla bozza.
    const savedDraft = upsertOrderDraft(db, orderId, orderWriteData, { approvalStatus: null });
    return NextResponse.json({
      draft: dbDraftToOrderDraft(savedDraft),
      order: dbOrderToOrder(order, { draftRow: savedDraft, includeDraft: true }),
    });
  } catch (error) {
    console.error("[orders] Errore salvataggio bozza modifica:", error);
    return NextResponse.json({ error: "Errore nel salvataggio della bozza" }, { status: 500 });
  }
}

/** POST /api/orders/[id]/draft — apply the current modification draft to the order (o inviala in approvazione) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await getAuthorizedOrder(req, params);
  if (authorized.error) return authorized.error;

  const { db, orderId, order, payload } = authorized;
  if (isUnsentOrderStatus(resolveOrderStatus(order.status))) {
    return NextResponse.json({ error: DRAFT_ROUTE_ERROR }, { status: 409 });
  }

  const draftRow = getOrderDraft(db, orderId);
  if (!draftRow) {
    return NextResponse.json({ error: "Bozza di modifica non trovata" }, { status: 404 });
  }

  const draftItems = parseOrderItems(draftRow.items);
  const incompleteReason = getOrderIncompleteReason({ ...draftRow, items: draftItems }, "confermato");
  if (incompleteReason) {
    return NextResponse.json({ error: incompleteReason }, { status: 400 });
  }
  if (itemsRequireApproval(draftItems) && payload.role !== "admin") {
    db.prepare(
      `UPDATE order_drafts SET approval_status = 'in_approvazione', approval_requested_at = ?, approval_note = NULL, updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(new Date().toISOString(), orderId);
    const pendingDraft = getOrderDraft(db, orderId) ?? draftRow;
    const orderWithDraft = dbOrderToOrder(order, { draftRow: pendingDraft, includeDraft: true });
    notifyAdminsApprovalRequested(db, orderApprovalDoc(orderWithDraft, getAppBaseUrl(req), "modifica", draftItems)).catch((err) =>
      console.error("[approvazioni] Errore notifica admin:", err)
    );
    return NextResponse.json({ order: orderWithDraft, pendingApproval: true });
  }

  const previousSnapshot = applyOrderDraft(db, order, draftRow);

  const updatedOrder = getDbOrder(db, orderId);
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
  if (isUnsentOrderStatus(resolveOrderStatus(order.status))) {
    return NextResponse.json({ error: DRAFT_ROUTE_ERROR }, { status: 409 });
  }

  const deleted = deleteOrderDraft(db, orderId);
  if (deleted === 0) {
    return NextResponse.json({ error: "Bozza di modifica non trovata" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
