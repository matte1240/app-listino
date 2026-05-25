import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { dbOrderToOrder, resolveOrderStatus, type DbOrder } from "@/lib/orders";
import { userOwnsCustomerByRap } from "@/lib/rap";

function canManageOrder(
  db: ReturnType<typeof getDb>,
  payload: { id: number; username: string; role: "admin" | "agente" },
  order: { agente: string; cliente_id: number | null }
): boolean {
  if (payload.role === "admin") return true;
  if (order.agente === payload.username) return true;
  return userOwnsCustomerByRap(db, payload.id, order.cliente_id);
}

/** POST /api/orders/[id]/restore — restore a cancelled order */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  if (!canManageOrder(db, payload, existing)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const currentStatus = resolveOrderStatus(existing.status);
  if (currentStatus !== "annullato") {
    return NextResponse.json({ error: "Solo gli ordini annullati possono essere ripristinati" }, { status: 409 });
  }

  const restoredStatus = existing.cancelled_from_status
    ? resolveOrderStatus(existing.cancelled_from_status)
    : "confermato";

  if (restoredStatus === "annullato") {
    return NextResponse.json({ error: "Stato di ripristino non valido" }, { status: 409 });
  }

  const result = db.prepare(
    `UPDATE orders
     SET status = ?, updated_at = datetime('now'), cancelled_at = NULL, cancelled_by = NULL, cancelled_from_status = NULL
     WHERE id = ?`
  ).run(restoredStatus, orderId);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const restored = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;

  if (!restored) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  return NextResponse.json({ order: dbOrderToOrder(restored), restoredStatus });
}