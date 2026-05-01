import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail } from "@/lib/mail";
import { dbOrderToOrder, getOrderDraftMap, type DbOrder } from "@/lib/orders";
import type { Order, OrderHistoryItem } from "@/types";

/** GET /api/orders — list orders (admin sees all, agente sees own) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const db = getDb();
  const rows =
    payload.role === "admin"
      ? (db
          .prepare(
            "SELECT * FROM orders WHERE NOT (status = 'bozza' AND parent_order_id IS NOT NULL) ORDER BY created_at DESC"
          )
          .all() as DbOrder[])
      : (db
          .prepare(
            "SELECT * FROM orders WHERE agente = ? AND NOT (status = 'bozza' AND parent_order_id IS NOT NULL) ORDER BY created_at DESC"
          )
          .all(payload.username) as DbOrder[]);

  const draftMap = getOrderDraftMap(db, rows.map((row) => row.id));
  const orders: Order[] = rows.map((row) =>
    dbOrderToOrder(row, { draftRow: draftMap.get(row.id) ?? null })
  );

  return NextResponse.json({ orders });
}

/** POST /api/orders — save a new order */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

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

  const db = getDb();
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

  const result = db
    .prepare(
      `INSERT INTO orders (cliente, cliente_id, magazzino, luogo_consegna, data_consegna, note, agente, items, status, parent_order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      resolvedCliente,
      resolvedClienteId,
      magazzino,
      luogoConsegna ?? "",
      dataConsegna ?? "",
      note ?? "",
      payload.username,
      JSON.stringify(items),
      resolvedStatus,
      null
    );

  const orderId = result.lastInsertRowid as number;

  const order: Order = {
    id: orderId,
    parentOrderId: null,
    clienteId: resolvedClienteId,
    cliente: resolvedCliente,
    magazzino,
    luogoConsegna: luogoConsegna ?? "",
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    agente: payload.username,
    items,
    status: resolvedStatus,
    createdAt: new Date().toISOString(),
    hasDraft: false,
    draftUpdatedAt: null,
    draft: null,
  };

  if (resolvedStatus === "confermato") {
    sendOrderEmail(order, payload.email).catch((err) => console.error("[mail] Errore invio email ordine:", err));
  }

  return NextResponse.json({ id: orderId }, { status: 201 });
}
