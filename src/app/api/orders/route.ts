import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail } from "@/lib/mail";
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
      ? (db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as DbOrder[])
      : (db
          .prepare("SELECT * FROM orders WHERE agente = ? ORDER BY created_at DESC")
          .all(payload.username) as DbOrder[]);

  const orders: Order[] = rows.map(dbToOrder);
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

  const { clienteId, cliente, magazzino, luogoConsegna, dataConsegna, note, items } = body as {
    clienteId: number | null;
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    dataConsegna: string;
    note: string;
    items: OrderHistoryItem[];
  };

  if (!magazzino?.trim() || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Dati ordine incompleti" }, { status: 400 });
  }

  const normalizedClienteId = Number(clienteId);
  if (!Number.isInteger(normalizedClienteId) || normalizedClienteId <= 0) {
    return NextResponse.json({ error: "Seleziona un cliente dalle anagrafiche" }, { status: 400 });
  }

  const db = getDb();

  const selectedCustomer = db
    .prepare("SELECT id, ragione_sociale FROM anagrafiche WHERE id = ?")
    .get(normalizedClienteId) as { id: number; ragione_sociale: string } | undefined;

  if (!selectedCustomer) {
    return NextResponse.json({ error: "Cliente anagrafica non trovato" }, { status: 400 });
  }

  const clienteName = selectedCustomer.ragione_sociale || cliente?.trim() || "";
  if (!clienteName) {
    return NextResponse.json({ error: "Seleziona un cliente valido" }, { status: 400 });
  }

  const result = db
    .prepare(
      `INSERT INTO orders (cliente_id, cliente, magazzino, luogo_consegna, data_consegna, note, agente, items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      selectedCustomer.id,
      clienteName,
      magazzino,
      luogoConsegna ?? "",
      dataConsegna ?? "",
      note ?? "",
      payload.username,
      JSON.stringify(items)
    );

  const orderId = result.lastInsertRowid as number;

  // Send email notification (fire-and-forget, don't block the response)
  const order: Order = {
    id: orderId,
    clienteId: selectedCustomer.id,
    cliente: clienteName,
    magazzino,
    luogoConsegna: luogoConsegna ?? "",
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    agente: payload.username,
    items,
    createdAt: new Date().toISOString(),
  };
  sendOrderEmail(order, payload.email).catch((err) => console.error("[mail] Errore invio email ordine:", err));

  return NextResponse.json({ id: orderId }, { status: 201 });
}

interface DbOrder {
  id: number;
  cliente_id: number | null;
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
    clienteId: r.cliente_id ?? null,
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
