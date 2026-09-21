import type Database from "better-sqlite3";
import type { JwtPayload } from "@/lib/auth";
import { itemsRequireApproval, linesCoveredByQuotation } from "@/lib/order-lines";
import { dbOrderToOrder, getOrderDraftMap, type DbOrder } from "@/lib/orders";
import { dbQuotationToQuotation, parseQuotationItems, type DbQuotation, type QuotationSubmitState } from "@/lib/quotations";
import type { Order, OrderHistoryItem, Quotation } from "@/types";

/**
 * Regole server-side dell'approvazione admin (sconti liberi).
 * Il client non decide mai lo stato finale: lo fa il server in base alle righe e al ruolo.
 */

export interface OrderSubmitState {
  status: "confermato" | "in_approvazione";
  approvalRequestedAt: string | null;
  approvalDecidedAt: string | null;
  approvalDecidedBy: string | null;
}

interface ResolveOrderInput {
  items: OrderHistoryItem[];
  user: Pick<JwtPayload, "role" | "username">;
  /** Righe del preventivo di origine, se attivo (già approvato o senza sconti liberi). */
  sourceQuotationItems?: OrderHistoryItem[] | null;
}

/** Decide se un ordine inviato parte subito (`confermato`) o va in attesa dell'admin. */
export function resolveOrderSubmitState({ items, user, sourceQuotationItems }: ResolveOrderInput): OrderSubmitState {
  const now = new Date().toISOString();
  if (!itemsRequireApproval(items)) {
    return { status: "confermato", approvalRequestedAt: null, approvalDecidedAt: null, approvalDecidedBy: null };
  }
  if (user.role === "admin") {
    // L'admin approva implicitamente ciò che invia.
    return { status: "confermato", approvalRequestedAt: now, approvalDecidedAt: now, approvalDecidedBy: user.username };
  }
  if (sourceQuotationItems && linesCoveredByQuotation(items, sourceQuotationItems)) {
    // Le righe scontate sono identiche al preventivo già approvato: nessuna seconda approvazione.
    return { status: "confermato", approvalRequestedAt: null, approvalDecidedAt: null, approvalDecidedBy: null };
  }
  return { status: "in_approvazione", approvalRequestedAt: now, approvalDecidedAt: null, approvalDecidedBy: null };
}

/** Decide se un preventivo salvato è subito `attivo` o va in attesa dell'admin. */
export function resolveQuotationSubmitState(items: OrderHistoryItem[], user: Pick<JwtPayload, "role" | "username">): QuotationSubmitState {
  const now = new Date().toISOString();
  if (!itemsRequireApproval(items)) {
    return { status: "attivo", approvalRequestedAt: null, approvalDecidedAt: null, approvalDecidedBy: null };
  }
  if (user.role === "admin") {
    return { status: "attivo", approvalRequestedAt: now, approvalDecidedAt: now, approvalDecidedBy: user.username };
  }
  return { status: "in_approvazione", approvalRequestedAt: now, approvalDecidedAt: null, approvalDecidedBy: null };
}

/** Righe del preventivo di origine utilizzabili per evitare una seconda approvazione (solo se attivo). */
export function getApprovedQuotationItems(quotation: DbQuotation | undefined): OrderHistoryItem[] | null {
  if (!quotation || quotation.status !== "attivo") return null;
  return parseQuotationItems(quotation.items);
}

/** Messaggio di errore quando un preventivo non è utilizzabile per creare un ordine. */
export function quotationUnavailableReason(status: string | null | undefined): string | null {
  if (status === "attivo") return null;
  if (status === "convertito") return "Preventivo già trasformato in ordine";
  if (status === "in_approvazione") return "Preventivo in attesa di approvazione: non può ancora essere trasformato in ordine";
  if (status === "rifiutato") return "Preventivo rifiutato dall'amministratore: correggilo e reinvialo prima di trasformarlo in ordine";
  return "Preventivo non disponibile";
}

export interface AdminRecipients {
  ids: number[];
  emails: string[];
}

export function getAdminRecipients(db: Database.Database): AdminRecipients {
  const rows = db.prepare("SELECT id, email FROM users WHERE role = 'admin'").all() as Array<{ id: number; email: string }>;
  return {
    ids: rows.map((row) => row.id),
    emails: rows.map((row) => row.email?.trim()).filter((email): email is string => !!email),
  };
}

export interface PendingApprovals {
  orders: Order[];
  /** Ordini confermati con una bozza di modifica in attesa (la bozza è inclusa in `draft`). */
  drafts: Order[];
  quotations: Quotation[];
  count: number;
}

export function listPendingApprovals(db: Database.Database): PendingApprovals {
  const orderRows = db
    .prepare(
      `SELECT orders.*, users.full_name AS agente_full_name
       FROM orders
       LEFT JOIN users ON users.username = orders.agente
       WHERE orders.status = 'in_approvazione'
       ORDER BY orders.approval_requested_at ASC, orders.id ASC`
    )
    .all() as DbOrder[];

  const draftOrderRows = db
    .prepare(
      `SELECT orders.*, users.full_name AS agente_full_name
       FROM orders
       INNER JOIN order_drafts d ON d.order_id = orders.id
       LEFT JOIN users ON users.username = orders.agente
       WHERE d.approval_status = 'in_approvazione'
       ORDER BY d.approval_requested_at ASC, orders.id ASC`
    )
    .all() as DbOrder[];
  const draftMap = getOrderDraftMap(db, draftOrderRows.map((row) => row.id));

  const quotationRows = db
    .prepare(
      `SELECT quotations.*, users.full_name AS agente_full_name
       FROM quotations
       LEFT JOIN users ON users.username = quotations.agente
       WHERE quotations.status = 'in_approvazione'
       ORDER BY quotations.approval_requested_at ASC, quotations.id ASC`
    )
    .all() as DbQuotation[];

  const orders = orderRows.map((row) => dbOrderToOrder(row));
  const drafts = draftOrderRows.map((row) => dbOrderToOrder(row, { draftRow: draftMap.get(row.id) ?? null, includeDraft: true }));
  const quotations = quotationRows.map(dbQuotationToQuotation);

  return { orders, drafts, quotations, count: orders.length + drafts.length + quotations.length };
}

export function countPendingApprovals(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE status = 'in_approvazione')
         + (SELECT COUNT(*) FROM order_drafts WHERE approval_status = 'in_approvazione')
         + (SELECT COUNT(*) FROM quotations WHERE status = 'in_approvazione') AS total`
    )
    .get() as { total: number };
  return row.total;
}
