import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
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

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO orders (cliente, magazzino, luogo_consegna, data_consegna, note, agente, items)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cliente.trim(),
      magazzino,
      luogoConsegna ?? "",
      dataConsegna ?? "",
      note ?? "",
      payload.username,
      JSON.stringify(items)
    );

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}

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
