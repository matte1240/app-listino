import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { parseOrderItems } from "@/lib/orders";
import { calculateOrderDiscountedTotal, roundToCents } from "@/lib/order-totals";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import type { OrderStatus } from "@/types";

/** Le bozze di modifica di un ordine già inviato sono righe tecniche: non contano come ordini (come nell'elenco). */
const REAL_ORDERS = "NOT (status = 'bozza' AND parent_order_id IS NOT NULL)";
/** Ordini effettivamente inseriti: esclusi bozze non inviate e annullati. */
const PLACED_ORDERS = `${REAL_ORDERS} AND status NOT IN ('bozza', 'annullato')`;
const SENT_STATUSES: OrderStatus[] = ["confermato", "in_lavorazione", "spedito", "consegnato"];

interface OrderRow {
  id: number;
  cliente: string;
  status: OrderStatus;
  agente: string;
  agente_full_name: string | null;
  items: string;
  created_at: string;
}

function periodTotals(rows: Pick<OrderRow, "items">[]) {
  const imponibile = rows.reduce((sum, row) => sum + calculateOrderDiscountedTotal(parseOrderItems(row.items)), 0);
  return { orders: rows.length, imponibile: roundToCents(imponibile) };
}

export async function GET() {
  const session = await getServerSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const db = getDb();

  try {
    const orderCounts = Object.fromEntries(
      (db.prepare(`SELECT status, COUNT(*) AS count FROM orders WHERE ${REAL_ORDERS} GROUP BY status`).all() as {
        status: OrderStatus;
        count: number;
      }[]).map((row) => [row.status, row.count])
    ) as Partial<Record<OrderStatus, number>>;

    const quotationCounts = Object.fromEntries(
      (db.prepare("SELECT status, COUNT(*) AS count FROM quotations GROUP BY status").all() as {
        status: string;
        count: number;
      }[]).map((row) => [row.status, row.count])
    ) as Record<string, number>;

    // Mese in corso contro lo stesso periodo del mese precedente (dal giorno 1 alla stessa data e ora),
    // così a inizio mese il confronto non è falsato da un mese precedente completo.
    const thisMonth = db
      .prepare(`SELECT items FROM orders WHERE ${PLACED_ORDERS} AND created_at >= datetime('now', 'start of month')`)
      .all() as Pick<OrderRow, "items">[];
    const previousPeriod = db
      .prepare(
        `SELECT items FROM orders
         WHERE ${PLACED_ORDERS}
           AND created_at >= datetime('now', 'start of month', '-1 month')
           AND created_at < MIN(datetime('now', '-1 month'), datetime('now', 'start of month'))`
      )
      .all() as Pick<OrderRow, "items">[];

    const customers = db
      .prepare(`SELECT COUNT(DISTINCT COALESCE(CAST(cliente_id AS TEXT), UPPER(TRIM(cliente)))) AS count FROM orders WHERE ${PLACED_ORDERS}`)
      .get() as { count: number };

    const recentRows = db
      .prepare(
        `SELECT orders.id, orders.cliente, orders.status, orders.agente, orders.items, orders.created_at,
                users.full_name AS agente_full_name
         FROM orders LEFT JOIN users ON users.username = orders.agente
         WHERE NOT (orders.status = 'bozza' AND orders.parent_order_id IS NOT NULL)
         ORDER BY orders.created_at DESC, orders.id DESC
         LIMIT 5`
      )
      .all() as OrderRow[];

    const count = (status: OrderStatus) => orderCounts[status] ?? 0;
    const orders = {
      inviati: SENT_STATUSES.reduce((sum, status) => sum + count(status), 0),
      inApprovazione: count("in_approvazione"),
      bozze: count("bozza"),
      annullati: count("annullato"),
    };

    return NextResponse.json({
      orders: { ...orders, total: orders.inviati + orders.inApprovazione + orders.bozze + orders.annullati },
      month: { current: periodTotals(thisMonth), previous: periodTotals(previousPeriod) },
      quotations: {
        attivi: quotationCounts.attivo ?? 0,
        inApprovazione: quotationCounts.in_approvazione ?? 0,
        rifiutati: quotationCounts.rifiutato ?? 0,
        convertiti: quotationCounts.convertito ?? 0,
      },
      customers: customers.count,
      recentOrders: recentRows.map((row) => ({
        id: row.id,
        cliente: row.cliente,
        status: row.status,
        agente: row.agente_full_name || row.agente,
        createdAt: normalizeUtcTimestamp(row.created_at),
        totale: calculateOrderDiscountedTotal(parseOrderItems(row.items)),
      })),
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Errore nel recupero statistiche" }, { status: 500 });
  }
}
