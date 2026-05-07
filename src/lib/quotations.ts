import type Database from "better-sqlite3";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import type { Quotation, QuotationItem, QuotationStatus, ValiditaPreventivoGiorni } from "@/types";

export interface DbQuotation {
  id: number;
  numero: string;
  cliente: string;
  cliente_id: number | null;
  status: string | null;
  converted_order_id: number | null;
  data_preventivo: string;
  data_consegna_prevista: string | null;
  validita_giorni: number | null;
  note: string;
  agente: string;
  agente_full_name?: string | null;
  items: string;
  created_at: string;
  updated_at: string;
}

export interface QuotationWriteData {
  cliente: string;
  clienteId: number | null;
  dataPreventivo: string;
  dataConsegnaPrevista: string;
  validitaGiorni: ValiditaPreventivoGiorni;
  note: string;
  agente: string;
  items: QuotationItem[];
}

function parseQuotationItems(rawItems: string): QuotationItem[] {
  try {
    const items = JSON.parse(rawItems) as QuotationItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function normalizeValiditaGiorni(value: number | null | undefined): ValiditaPreventivoGiorni {
  return value === 7 || value === 15 || value === 30 ? value : 30;
}

function normalizeQuotationStatus(value: string | null | undefined): QuotationStatus {
  return value === "convertito" ? "convertito" : "attivo";
}

export function dbQuotationToQuotation(row: DbQuotation): Quotation {
  return {
    id: row.id,
    numero: row.numero || `PREV-${row.id}`,
    clienteId: row.cliente_id ?? null,
    cliente: row.cliente,
    status: normalizeQuotationStatus(row.status),
    convertedOrderId: row.converted_order_id ?? null,
    dataPreventivo: row.data_preventivo,
    dataConsegnaPrevista: row.data_consegna_prevista ?? "",
    validitaGiorni: normalizeValiditaGiorni(row.validita_giorni),
    note: row.note,
    agente: row.agente,
    agenteFullName: row.agente_full_name || row.agente,
    items: parseQuotationItems(row.items),
    createdAt: normalizeUtcTimestamp(row.created_at),
    updatedAt: normalizeUtcTimestamp(row.updated_at || row.created_at),
  };
}

export function nextQuotationNumber(db: Database.Database, dateValue: string): string {
  const year = new Date(`${dateValue || new Date().toISOString().slice(0, 10)}T00:00:00`).getFullYear();
  const prefix = `PREV-${year}-`;
  const row = db
    .prepare("SELECT numero FROM quotations WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1")
    .get(`${prefix}%`) as { numero: string } | undefined;

  const lastProgressive = row?.numero ? Number(row.numero.replace(prefix, "")) : 0;
  const nextProgressive = Number.isFinite(lastProgressive) ? lastProgressive + 1 : 1;
  return `${prefix}${String(nextProgressive).padStart(4, "0")}`;
}

export function listQuotations(db: Database.Database, options: { agente?: string | null } = {}): Quotation[] {
  const rows = options.agente
    ? (db.prepare(
        `SELECT quotations.*, users.full_name AS agente_full_name
         FROM quotations
         LEFT JOIN users ON users.username = quotations.agente
         WHERE quotations.agente = ?
         ORDER BY datetime(quotations.created_at) DESC, quotations.id DESC`
      ).all(options.agente) as DbQuotation[])
    : (db.prepare(
        `SELECT quotations.*, users.full_name AS agente_full_name
         FROM quotations
         LEFT JOIN users ON users.username = quotations.agente
         ORDER BY datetime(quotations.created_at) DESC, quotations.id DESC`
      ).all() as DbQuotation[]);

  return rows.map(dbQuotationToQuotation);
}

export function getQuotation(db: Database.Database, id: number): Quotation | null {
  const row = getDbQuotation(db, id);
  return row ? dbQuotationToQuotation(row) : null;
}

export function getDbQuotation(db: Database.Database, id: number): DbQuotation | undefined {
  return db.prepare(
    `SELECT quotations.*, users.full_name AS agente_full_name
     FROM quotations
     LEFT JOIN users ON users.username = quotations.agente
     WHERE quotations.id = ?`
  ).get(id) as DbQuotation | undefined;
}

export function createQuotation(db: Database.Database, data: QuotationWriteData): Quotation {
  const quotationNumber = nextQuotationNumber(db, data.dataPreventivo);
  const result = db
    .prepare(
      `INSERT INTO quotations (numero, cliente, cliente_id, data_preventivo, data_consegna_prevista, validita_giorni, note, agente, items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      quotationNumber,
      data.cliente,
      data.clienteId,
      data.dataPreventivo,
      data.dataConsegnaPrevista,
      data.validitaGiorni,
      data.note,
      data.agente,
      JSON.stringify(data.items)
    );

  const quotation = getQuotation(db, result.lastInsertRowid as number);
  if (!quotation) throw new Error("Preventivo non trovato dopo il salvataggio");
  return quotation;
}

export function updateQuotation(db: Database.Database, id: number, data: Omit<QuotationWriteData, "agente">): Quotation | null {
  const stmt = db.prepare(
    `UPDATE quotations
     SET cliente = ?, cliente_id = ?, data_preventivo = ?, data_consegna_prevista = ?, validita_giorni = ?, note = ?, items = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  const result = stmt.run(data.cliente, data.clienteId, data.dataPreventivo, data.dataConsegnaPrevista, data.validitaGiorni, data.note, JSON.stringify(data.items), id);

  if (result.changes === 0) return null;
  return getQuotation(db, id);
}

export function deleteQuotation(db: Database.Database, id: number): number {
  return db.prepare("DELETE FROM quotations WHERE id = ?").run(id).changes;
}

export function markQuotationConverted(db: Database.Database, quotationId: number, orderId: number): number {
  return db.prepare(
    `UPDATE quotations
     SET status = 'convertito', converted_order_id = ?, updated_at = datetime('now')
     WHERE id = ? AND status != 'convertito'`
  ).run(orderId, quotationId).changes;
}