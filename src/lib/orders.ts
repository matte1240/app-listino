import type Database from "better-sqlite3";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import type { DraftApprovalStatus, Order, OrderDraft, OrderHistoryItem, OrderStatus } from "@/types";

export interface DbOrder {
  id: number;
  parent_order_id: number | null;
  quotation_id: number | null;
  cliente: string;
  cliente_id: number | null;
  magazzino: string;
  luogo_consegna: string;
  data_consegna: string;
  note: string;
  agente: string;
  agente_full_name?: string | null;
  items: string;
  status: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_from_status: string | null;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  approval_note: string | null;
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
  approval_status: string | null;
  approval_requested_at: string | null;
  approval_note: string | null;
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
  "in_approvazione",
  "confermato",
  "in_lavorazione",
  "spedito",
  "consegnato",
  "annullato",
]);

export function resolveOrderStatus(status: string): OrderStatus {
  return ORDER_STATUSES.has(status as OrderStatus) ? (status as OrderStatus) : "confermato";
}

/** Ordine non ancora inviato al magazzino: bozza o in attesa di approvazione admin. */
export function isUnsentOrderStatus(status: OrderStatus | string): boolean {
  return status === "bozza" || status === "in_approvazione";
}

function resolveDraftApprovalStatus(value: string | null | undefined): DraftApprovalStatus | null {
  return value === "in_approvazione" || value === "rifiutato" ? value : null;
}

function nullableTimestamp(value: string | null | undefined): string | null {
  return value ? normalizeUtcTimestamp(value) : null;
}

export function parseOrderItems(rawItems: string): OrderHistoryItem[] {
  try {
    const items = JSON.parse(rawItems) as OrderHistoryItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
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
    items: parseOrderItems(row.items),
    createdAt: normalizeUtcTimestamp(row.created_at),
    updatedAt: normalizeUtcTimestamp(row.updated_at),
    approvalStatus: resolveDraftApprovalStatus(row.approval_status),
    approvalRequestedAt: nullableTimestamp(row.approval_requested_at),
    approvalNote: row.approval_note ?? null,
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
    quotationId: row.quotation_id ?? null,
    clienteId: row.cliente_id ?? null,
    cliente: row.cliente,
    magazzino: row.magazzino,
    luogoConsegna: row.luogo_consegna,
    dataConsegna: row.data_consegna,
    note: row.note,
    agente: row.agente,
    agenteFullName: row.agente_full_name || row.agente,
    items: parseOrderItems(row.items),
    status: resolveOrderStatus(row.status),
    createdAt: normalizeUtcTimestamp(row.created_at),
    updatedAt: normalizeUtcTimestamp(row.updated_at),
    cancelledAt: nullableTimestamp(row.cancelled_at),
    cancelledBy: row.cancelled_by ?? null,
    cancelledFromStatus: row.cancelled_from_status ? resolveOrderStatus(row.cancelled_from_status) : null,
    approvalRequestedAt: nullableTimestamp(row.approval_requested_at),
    approvalDecidedAt: nullableTimestamp(row.approval_decided_at),
    approvalDecidedBy: row.approval_decided_by ?? null,
    approvalNote: row.approval_note ?? null,
    hasDraft: !!draftRow,
    draftUpdatedAt: draftRow ? normalizeUtcTimestamp(draftRow.updated_at) : null,
    draftApprovalStatus: draftRow ? resolveDraftApprovalStatus(draftRow.approval_status) : null,
    draftApprovalNote: draftRow?.approval_note ?? null,
    draft: options?.includeDraft && draftRow ? dbDraftToOrderDraft(draftRow) : null,
  };
}

/** Riga ordine con il nome completo dell'agente. */
export function getDbOrder(db: Database.Database, orderId: number): DbOrder | undefined {
  return db
    .prepare(
      `SELECT orders.*, users.full_name AS agente_full_name
       FROM orders
       LEFT JOIN users ON users.username = orders.agente
       WHERE orders.id = ?`
    )
    .get(orderId) as DbOrder | undefined;
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

export interface UpsertOrderDraftOptions {
  /** `in_approvazione` mette la bozza in attesa dell'admin; `null` (default) la salva/ritira come normale bozza. */
  approvalStatus?: DraftApprovalStatus | null;
}

export function upsertOrderDraft(
  db: Database.Database,
  orderId: number,
  data: OrderWriteData,
  options: UpsertOrderDraftOptions = {}
): DbOrderDraft {
  const existingDraft = getOrderDraft(db, orderId);
  const approvalStatus = options.approvalStatus ?? null;
  const approvalRequestedAt = approvalStatus === "in_approvazione" ? new Date().toISOString() : null;

  if (existingDraft) {
    db.prepare(
      `UPDATE order_drafts
       SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?,
           approval_status = ?, approval_requested_at = ?, approval_note = NULL, updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(
      data.cliente,
      data.clienteId,
      data.magazzino,
      data.luogoConsegna,
      data.dataConsegna,
      data.note,
      JSON.stringify(data.items),
      approvalStatus,
      approvalRequestedAt,
      orderId
    );
  } else {
    db.prepare(
      `INSERT INTO order_drafts (order_id, cliente, cliente_id, magazzino, luogo_consegna, data_consegna, note, items, approval_status, approval_requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      data.cliente,
      data.clienteId,
      data.magazzino,
      data.luogoConsegna,
      data.dataConsegna,
      data.note,
      JSON.stringify(data.items),
      approvalStatus,
      approvalRequestedAt
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

/**
 * Applica la bozza di modifica all'ordine confermato (dentro una transazione) e la elimina.
 * Restituisce lo snapshot precedente per l'email di modifica.
 */
export function applyOrderDraft(db: Database.Database, order: DbOrder, draftRow: DbOrderDraft) {
  const previousSnapshot = {
    cliente: order.cliente,
    magazzino: order.magazzino,
    luogoConsegna: order.luogo_consegna,
    dataConsegna: order.data_consegna,
    note: order.note,
    items: parseOrderItems(order.items),
  };

  db.transaction(() => {
    db.prepare(
      `UPDATE orders
       SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      draftRow.cliente,
      draftRow.cliente_id,
      draftRow.magazzino,
      draftRow.luogo_consegna,
      draftRow.data_consegna,
      draftRow.note,
      draftRow.items,
      order.id
    );

    deleteOrderDraft(db, order.id);
    db.prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'").run(order.id);
  })();

  return previousSnapshot;
}

/** Email dell'agente proprietario dell'ordine (per CC/reply-to quando l'invio avviene da un admin). */
export function getUserEmailByUsername(db: Database.Database, username: string): string | undefined {
  const row = db.prepare("SELECT email FROM users WHERE username = ?").get(username) as { email: string } | undefined;
  return row?.email?.trim() || undefined;
}
