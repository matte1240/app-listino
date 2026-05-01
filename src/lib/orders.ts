import type Database from "better-sqlite3";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import type { Order, OrderDraft, OrderHistoryItem, OrderStatus } from "@/types";

export interface DbOrder {
  id: number;
  parent_order_id: number | null;
  cliente: string;
  cliente_id: number | null;
  magazzino: string;
  luogo_consegna: string;
  data_consegna: string;
  note: string;
  agente: string;
  items: string;
  status: string;
  created_at: string;
}

export interface DbOrderDraft {
  order_id: number;
  cliente: string;
  cliente_id: number | null;
  magazzino: string;
  luogo_consegna: string;
  data_consegna: string;
  note: string;
  items: string;
  created_at: string;
  updated_at: string;
}

export interface OrderWriteData {
  cliente: string;
  clienteId: number | null;
  magazzino: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
  items: OrderHistoryItem[];
}

const ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "bozza",
  "confermato",
  "in_lavorazione",
  "spedito",
  "consegnato",
  "annullato",
]);

export function resolveOrderStatus(status: string): OrderStatus {
  return ORDER_STATUSES.has(status as OrderStatus) ? (status as OrderStatus) : "confermato";
}

export function dbDraftToOrderDraft(row: DbOrderDraft): OrderDraft {
  return {
    orderId: row.order_id,
    clienteId: row.cliente_id ?? null,
    cliente: row.cliente,
    magazzino: row.magazzino,
    luogoConsegna: row.luogo_consegna,
    dataConsegna: row.data_consegna,
    note: row.note,
    items: JSON.parse(row.items) as OrderHistoryItem[],
    createdAt: normalizeUtcTimestamp(row.created_at),
    updatedAt: normalizeUtcTimestamp(row.updated_at),
  };
}

export function dbOrderToOrder(
  row: DbOrder,
  options?: { draftRow?: DbOrderDraft | null; includeDraft?: boolean }
): Order {
  const draftRow = options?.draftRow ?? null;

  return {
    id: row.id,
    parentOrderId: row.parent_order_id ?? null,
    clienteId: row.cliente_id ?? null,
    cliente: row.cliente,
    magazzino: row.magazzino,
    luogoConsegna: row.luogo_consegna,
    dataConsegna: row.data_consegna,
    note: row.note,
    agente: row.agente,
    items: JSON.parse(row.items) as OrderHistoryItem[],
    status: resolveOrderStatus(row.status),
    createdAt: normalizeUtcTimestamp(row.created_at),
    hasDraft: !!draftRow,
    draftUpdatedAt: draftRow ? normalizeUtcTimestamp(draftRow.updated_at) : null,
    draft: options?.includeDraft && draftRow ? dbDraftToOrderDraft(draftRow) : null,
  };
}

export function getOrderDraft(db: Database.Database, orderId: number): DbOrderDraft | undefined {
  return db
    .prepare("SELECT * FROM order_drafts WHERE order_id = ?")
    .get(orderId) as DbOrderDraft | undefined;
}

export function getOrderDraftMap(db: Database.Database, orderIds: number[]): Map<number, DbOrderDraft> {
  if (orderIds.length === 0) return new Map();

  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM order_drafts WHERE order_id IN (${placeholders})`)
    .all(...orderIds) as DbOrderDraft[];

  return new Map(rows.map((row) => [row.order_id, row]));
}

export function upsertOrderDraft(db: Database.Database, orderId: number, data: OrderWriteData): DbOrderDraft {
  const existingDraft = getOrderDraft(db, orderId);

  if (existingDraft) {
    db.prepare(
      `UPDATE order_drafts
       SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(
      data.cliente,
      data.clienteId,
      data.magazzino,
      data.luogoConsegna,
      data.dataConsegna,
      data.note,
      JSON.stringify(data.items),
      orderId
    );
  } else {
    db.prepare(
      `INSERT INTO order_drafts (order_id, cliente, cliente_id, magazzino, luogo_consegna, data_consegna, note, items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      data.cliente,
      data.clienteId,
      data.magazzino,
      data.luogoConsegna,
      data.dataConsegna,
      data.note,
      JSON.stringify(data.items)
    );
  }

  const savedDraft = getOrderDraft(db, orderId);
  if (!savedDraft) {
    throw new Error(`Bozza ordine ${orderId} non trovata dopo il salvataggio`);
  }

  return savedDraft;
}

export function deleteOrderDraft(db: Database.Database, orderId: number): number {
  return db.prepare("DELETE FROM order_drafts WHERE order_id = ?").run(orderId).changes;
}