import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderUpdatedEmail, sendOrderCancelledEmail } from "@/lib/mail";
import type { Order, OrderHistoryItem } from "@/types";

interface DbOrder {
  id: number;
  cliente: string;
  magazzino: string;
  luogo_consegna: string;
  data_consegna: string;
  note: string;
  agente: string;
  items: string;
  created_at: string;
}

function dbToOrder(r: DbOrder): Order {
  return {
    id: r.id,
    cliente: r.cliente,
    magazzino: r.magazzino,
    luogoConsegna: r.luogo_consegna,
    dataConsegna: r.data_consegna,
    note: r.note,
    agente: r.agente,
    items: JSON.parse(r.items) as OrderHistoryItem[],
    createdAt: r.created_at,
  };
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
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!row) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  // Agents can only see their own orders
  if (payload.role !== "admin" && row.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  return NextResponse.json({ order: dbToOrder(row) });
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
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  // Only admin or the order owner can edit
  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { cliente, magazzino, luogoConsegna, dataConsegna, note, items } = body as {
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    dataConsegna: string;
    note: string;
    items: OrderHistoryItem[];
  };

  if (!cliente?.trim() || !magazzino?.trim() || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Dati ordine incompleti" }, { status: 400 });
  }

  db.prepare(
    `UPDATE orders SET cliente = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?
     WHERE id = ?`
  ).run(
    cliente.trim(),
    magazzino,
    luogoConsegna ?? "",
    dataConsegna ?? "",
    note ?? "",
    JSON.stringify(items),
    orderId
  );

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder;
  const order = dbToOrder(updated);

  sendOrderUpdatedEmail(order, payload.email).catch((err) =>
    console.error("[mail] Errore invio email modifica ordine:", err)
  );

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
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  // Only admin or the order owner can delete
  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const order = dbToOrder(existing);

  const result = db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  sendOrderCancelledEmail(order, payload.email).catch((err) =>
    console.error("[mail] Errore invio email cancellazione ordine:", err)
  );

  return NextResponse.json({ ok: true });
}
