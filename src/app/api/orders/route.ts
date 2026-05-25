import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail } from "@/lib/mail";
import { dbOrderToOrder, getOrderDraftMap, type DbOrder } from "@/lib/orders";
import { getDbQuotation, markQuotationConverted } from "@/lib/quotations";
import { userOwnsCustomerByRap } from "@/lib/rap";
import type { Order, OrderHistoryItem } from "@/types";

type OrderListStatusFilter = "all" | "attivi" | "annullati";

interface OrderListCounts {
  attivi: number;
  annullati: number;
}

function resolveOrderListStatusFilter(value: string | null): OrderListStatusFilter {
  if (value === "attivi" || value === "annullati") return value;
  return "all";
}

/** GET /api/orders — list orders (admin sees all, agente sees own + customers of own Rap) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const statusFilter = resolveOrderListStatusFilter(req.nextUrl.searchParams.get("status"));
  const statusWhereClause =
    statusFilter === "attivi"
      ? "AND orders.status <> 'annullato'"
      : statusFilter === "annullati"
        ? "AND orders.status = 'annullato'"
        : "";
  const orderByClause =
    statusFilter === "annullati"
      ? "ORDER BY COALESCE(orders.cancelled_at, orders.updated_at, orders.created_at) DESC"
      : "ORDER BY orders.created_at DESC";

  const db = getDb();
  const visibilityWhereClause =
    payload.role === "admin"
      ? `WHERE NOT (orders.status = 'bozza' AND orders.parent_order_id IS NOT NULL)`
      : `WHERE NOT (orders.status = 'bozza' AND orders.parent_order_id IS NOT NULL)
         AND (
           orders.agente = ?
           OR EXISTS (
             SELECT 1 FROM anagrafiche a
             JOIN rap_assignments ra ON ra.rap = a.rap
             WHERE a.id = orders.cliente_id AND ra.user_id = ?
           )
         )`;
  const visibilityParams = payload.role === "admin" ? [] : [payload.username, payload.id];

  const rows =
    payload.role === "admin"
      ? (db
          .prepare(
            `SELECT orders.*, users.full_name AS agente_full_name
             FROM orders
             LEFT JOIN users ON users.username = orders.agente
             ${visibilityWhereClause}
             ${statusWhereClause}
             ${orderByClause}`
          )
          .all() as DbOrder[])
      : (db
          .prepare(
            `SELECT orders.*, users.full_name AS agente_full_name
             FROM orders
             LEFT JOIN users ON users.username = orders.agente
             ${visibilityWhereClause}
               ${statusWhereClause}
             ${orderByClause}`
          )
          .all(...visibilityParams) as DbOrder[]);

  const countsRow = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN orders.status = 'annullato' THEN 1 ELSE 0 END), 0) AS annullati,
       COALESCE(SUM(CASE WHEN orders.status <> 'annullato' THEN 1 ELSE 0 END), 0) AS attivi
     FROM orders
     ${visibilityWhereClause}`
  ).get(...visibilityParams) as OrderListCounts;

  const draftMap = getOrderDraftMap(db, rows.map((row) => row.id));
  const orders: Order[] = rows.map((row) =>
    dbOrderToOrder(row, { draftRow: draftMap.get(row.id) ?? null })
  );

  return NextResponse.json({ orders, counts: countsRow });
}

/** POST /api/orders — save a new order */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { clienteId, cliente, magazzino, luogoConsegna, dataConsegna, note, items, status, quotationId } = body as {
    quotationId?: number | null;
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
  const normalizedQuotationId = Number(quotationId);
  const resolvedQuotationId = Number.isInteger(normalizedQuotationId) && normalizedQuotationId > 0 ? normalizedQuotationId : null;

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

  if (resolvedQuotationId !== null) {
    const sourceQuotation = getDbQuotation(db, resolvedQuotationId);
    if (!sourceQuotation) {
      return NextResponse.json({ error: "Preventivo non trovato" }, { status: 400 });
    }
    if (payload.role !== "admin" && sourceQuotation.agente !== payload.username && !userOwnsCustomerByRap(db, payload.id, sourceQuotation.cliente_id)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    if (sourceQuotation.status === "convertito") {
      return NextResponse.json({ error: "Preventivo già trasformato in ordine" }, { status: 409 });
    }
  }

  let orderId: number;
  try {
    orderId = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO orders (cliente, cliente_id, magazzino, luogo_consegna, data_consegna, note, agente, items, status, parent_order_id, quotation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          null,
          resolvedQuotationId
        );

      const savedOrderId = result.lastInsertRowid as number;
      if (resolvedStatus === "confermato" && resolvedQuotationId !== null) {
        const convertedChanges = markQuotationConverted(db, resolvedQuotationId, savedOrderId);
        if (convertedChanges === 0) throw new Error("QUOTATION_ALREADY_CONVERTED");
      }

      return savedOrderId;
    })();
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTATION_ALREADY_CONVERTED") {
      return NextResponse.json({ error: "Preventivo già trasformato in ordine" }, { status: 409 });
    }
    throw error;
  }

  const order: Order = {
    id: orderId,
    parentOrderId: null,
    quotationId: resolvedQuotationId,
    clienteId: resolvedClienteId,
    cliente: resolvedCliente,
    magazzino,
    luogoConsegna: luogoConsegna ?? "",
    dataConsegna: dataConsegna ?? "",
    note: note ?? "",
    agente: payload.username,
    agenteFullName: payload.fullName || payload.username,
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
