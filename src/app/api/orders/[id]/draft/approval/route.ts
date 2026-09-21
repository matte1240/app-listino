import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderUpdatedEmail } from "@/lib/mail";
import { applyOrderDraft, dbOrderToOrder, getDbOrder, getOrderDraft, getUserEmailByUsername, parseOrderItems } from "@/lib/orders";
import { getAppBaseUrl } from "@/lib/app-url";
import { notifyAgentApprovalDecided, orderApprovalDoc } from "@/lib/notifications";

function parseDecision(body: unknown): { action: "approve" | "reject"; note: string } | null {
  if (!body || typeof body !== "object") return null;
  const { action, note } = body as { action?: unknown; note?: unknown };
  if (action !== "approve" && action !== "reject") return null;
  return { action, note: typeof note === "string" ? note.trim().slice(0, 1000) : "" };
}

/** POST /api/orders/[id]/draft/approval — approva (applica) o rifiuta una bozza di modifica in attesa (solo admin) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const admin = auth.payload;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const decision = parseDecision(await req.json().catch(() => null));
  if (!decision) return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  const db = getDb();
  const order = getDbOrder(db, orderId);
  if (!order) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  const draftRow = getOrderDraft(db, orderId);
  if (!draftRow || draftRow.approval_status !== "in_approvazione") {
    return NextResponse.json({ error: "Nessuna modifica in attesa di approvazione per questo ordine" }, { status: 409 });
  }

  const baseUrl = getAppBaseUrl(req);
  const draftItems = parseOrderItems(draftRow.items);
  const decidedBy = admin.fullName || admin.username;

  if (decision.action === "reject") {
    const changes = db
      .prepare(
        `UPDATE order_drafts SET approval_status = 'rifiutato', approval_note = ?, updated_at = datetime('now')
         WHERE order_id = ? AND approval_status = 'in_approvazione'`
      )
      .run(decision.note || null, orderId).changes;
    if (changes === 0) return NextResponse.json({ error: "La modifica non è più in attesa di approvazione" }, { status: 409 });

    const orderWithDraft = dbOrderToOrder(order, { draftRow: getOrderDraft(db, orderId) ?? null, includeDraft: true });
    notifyAgentApprovalDecided(db, orderApprovalDoc(orderWithDraft, baseUrl, "modifica", draftItems), "rifiutato", decision.note, decidedBy).catch(
      (err) => console.error("[approvazioni] Errore notifica agente:", err)
    );
    return NextResponse.json({ order: orderWithDraft, decision: "rifiutato" });
  }

  const previousSnapshot = applyOrderDraft(db, order, draftRow);
  const updatedRow = getDbOrder(db, orderId);
  if (!updatedRow) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  const updatedOrder = dbOrderToOrder(updatedRow);
  const agentEmail = getUserEmailByUsername(db, updatedOrder.agente);

  sendOrderUpdatedEmail(updatedOrder, previousSnapshot, agentEmail).catch((err) =>
    console.error("[mail] Errore invio email modifica ordine:", err)
  );
  notifyAgentApprovalDecided(db, orderApprovalDoc(updatedOrder, baseUrl, "modifica"), "approvato", decision.note, decidedBy).catch((err) =>
    console.error("[approvazioni] Errore notifica agente:", err)
  );

  return NextResponse.json({ order: updatedOrder, decision: "approvato" });
}
