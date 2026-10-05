import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail } from "@/lib/mail";
import { dbOrderToOrder, getDbOrder, getUserEmailByUsername, resolveOrderStatus } from "@/lib/orders";
import { markQuotationConverted } from "@/lib/quotations";
import { quotationUnavailableReason } from "@/lib/approvals";
import { getAppBaseUrl } from "@/lib/app-url";
import { notifyAgentApprovalDecided, orderApprovalDoc } from "@/lib/notifications";

function parseDecision(body: unknown): { action: "approve" | "reject"; note: string } | null {
  if (!body || typeof body !== "object") return null;
  const { action, note } = body as { action?: unknown; note?: unknown };
  if (action !== "approve" && action !== "reject") return null;
  return { action, note: typeof note === "string" ? note.trim().slice(0, 1000) : "" };
}

/** POST /api/orders/[id]/approval — approva o rifiuta un ordine in attesa (solo admin) */
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
  const existing = getDbOrder(db, orderId);
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  if (resolveOrderStatus(existing.status) !== "in_approvazione") {
    return NextResponse.json({ error: "L'ordine non è in attesa di approvazione" }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (decision.action === "reject") {
    const changes = db
      .prepare(
        `UPDATE orders
         SET status = 'bozza', approval_requested_at = NULL, approval_decided_at = ?, approval_decided_by = ?, approval_note = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'in_approvazione'`
      )
      .run(now, admin.username, decision.note || null, orderId).changes;
    if (changes === 0) return NextResponse.json({ error: "L'ordine non è più in attesa di approvazione" }, { status: 409 });

    const rejected = getDbOrder(db, orderId);
    const order = rejected ? dbOrderToOrder(rejected) : null;
    if (order) {
      notifyAgentApprovalDecided(db, orderApprovalDoc(order, getAppBaseUrl(req)), "rifiutato", decision.note, admin.fullName || admin.username).catch(
        (err) => console.error("[approvazioni] Errore notifica agente:", err)
      );
    }
    return NextResponse.json({ order, decision: "rifiutato" });
  }

  try {
    db.transaction(() => {
      const changes = db
        .prepare(
          `UPDATE orders
           SET status = 'confermato', approval_decided_at = ?, approval_decided_by = ?, approval_note = ?, updated_at = datetime('now')
           WHERE id = ? AND status = 'in_approvazione'`
        )
        .run(now, admin.username, decision.note || null, orderId).changes;
      if (changes === 0) throw new Error("NOT_PENDING");

      if (existing.quotation_id !== null) {
        const converted = markQuotationConverted(db, existing.quotation_id, orderId);
        if (converted === 0) throw new Error("QUOTATION_UNAVAILABLE");
      }
    })();
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_PENDING") {
      return NextResponse.json({ error: "L'ordine non è più in attesa di approvazione" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "QUOTATION_UNAVAILABLE") {
      const quotation = db.prepare("SELECT status FROM quotations WHERE id = ?").get(existing.quotation_id) as { status: string } | undefined;
      return NextResponse.json({ error: quotationUnavailableReason(quotation?.status) ?? "Preventivo non disponibile" }, { status: 409 });
    }
    throw error;
  }

  const approvedRow = getDbOrder(db, orderId);
  if (!approvedRow) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  const order = dbOrderToOrder(approvedRow);
  const agentEmail = getUserEmailByUsername(db, order.agente);

  sendOrderEmail(order, agentEmail).catch((err) => console.error("[mail] Errore invio email ordine:", err));
  notifyAgentApprovalDecided(db, orderApprovalDoc(order, getAppBaseUrl(req)), "approvato", decision.note, admin.fullName || admin.username).catch(
    (err) => console.error("[approvazioni] Errore notifica agente:", err)
  );

  return NextResponse.json({ order, decision: "approvato" });
}
