import type Database from "better-sqlite3";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import { userOwnsCustomerByRap } from "@/lib/rap";
import { getFollowUpSettings, type AppSettings } from "@/lib/settings";
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
  luogo_consegna: string | null;
  validita_giorni: number | null;
  note: string;
  agente: string;
  agente_full_name?: string | null;
  items: string;
  created_at: string;
  updated_at: string;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  approval_note: string | null;
  followup_due_at: string | null;
  followup_reminded_at: string | null;
}

export type FollowUpConfig = Pick<AppSettings, "followUpEnabled" | "followUpDays">;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(normalizeUtcTimestamp(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Data del promemoria di ricontatto di un preventivo attivo:
 * quella fissata dal rappresentante (posticipo/riapertura) oppure attivazione + N giorni.
 * L'attivazione è l'approvazione admin, se c'è stata, altrimenti la creazione.
 */
export function computeFollowUpDueAt(
  row: Pick<DbQuotation, "status" | "created_at" | "approval_decided_at" | "followup_due_at">,
  config: FollowUpConfig
): Date | null {
  if (!config.followUpEnabled || normalizeQuotationStatus(row.status) !== "attivo") return null;
  const explicit = parseTimestamp(row.followup_due_at);
  if (explicit) return explicit;
  const activatedAt = parseTimestamp(row.approval_decided_at) ?? parseTimestamp(row.created_at);
  return activatedAt ? addDays(activatedAt, config.followUpDays) : null;
}

/**
 * Il promemoria va (re)inviato se è scaduto e non ne è già partito uno negli ultimi N giorni:
 * finché il rappresentante non registra un esito riceve al massimo un promemoria ogni N giorni.
 */
export function isFollowUpReminderDue(
  row: Pick<DbQuotation, "status" | "created_at" | "approval_decided_at" | "followup_due_at" | "followup_reminded_at">,
  config: FollowUpConfig,
  now: Date = new Date()
): boolean {
  const dueAt = computeFollowUpDueAt(row, config);
  if (!dueAt || dueAt.getTime() > now.getTime()) return false;
  const remindedAt = parseTimestamp(row.followup_reminded_at);
  return !remindedAt || addDays(remindedAt, config.followUpDays).getTime() <= now.getTime();
}

export interface QuotationWriteData {
  cliente: string;
  clienteId: number | null;
  dataPreventivo: string;
  dataConsegnaPrevista: string;
  luogoConsegna: string;
  validitaGiorni: ValiditaPreventivoGiorni;
  note: string;
  agente: string;
  items: QuotationItem[];
}

/** Stato iniziale/aggiornato del preventivo deciso dal server in base agli sconti liberi. */
export interface QuotationSubmitState {
  status: QuotationStatus;
  approvalRequestedAt: string | null;
  approvalDecidedAt: string | null;
  approvalDecidedBy: string | null;
}

export function parseQuotationItems(rawItems: string): QuotationItem[] {
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

const QUOTATION_STATUSES: ReadonlySet<QuotationStatus> = new Set(["attivo", "in_approvazione", "rifiutato", "convertito", "perso"]);

export function normalizeQuotationStatus(value: string | null | undefined): QuotationStatus {
  return value && QUOTATION_STATUSES.has(value as QuotationStatus) ? (value as QuotationStatus) : "attivo";
}

function nullableTimestamp(value: string | null | undefined): string | null {
  return value ? normalizeUtcTimestamp(value) : null;
}

export function dbQuotationToQuotation(
  row: DbQuotation,
  followUpConfig: FollowUpConfig = getFollowUpSettings(),
  now: Date = new Date()
): Quotation {
  const followUpDueAt = computeFollowUpDueAt(row, followUpConfig);
  return {
    id: row.id,
    numero: row.numero || `PREV-${row.id}`,
    clienteId: row.cliente_id ?? null,
    cliente: row.cliente,
    status: normalizeQuotationStatus(row.status),
    convertedOrderId: row.converted_order_id ?? null,
    dataPreventivo: row.data_preventivo,
    dataConsegnaPrevista: row.data_consegna_prevista ?? "",
    luogoConsegna: row.luogo_consegna ?? "",
    validitaGiorni: normalizeValiditaGiorni(row.validita_giorni),
    note: row.note,
    agente: row.agente,
    agenteFullName: row.agente_full_name || row.agente,
    items: parseQuotationItems(row.items),
    createdAt: normalizeUtcTimestamp(row.created_at),
    updatedAt: normalizeUtcTimestamp(row.updated_at || row.created_at),
    approvalRequestedAt: nullableTimestamp(row.approval_requested_at),
    approvalDecidedAt: nullableTimestamp(row.approval_decided_at),
    approvalDecidedBy: row.approval_decided_by ?? null,
    approvalNote: row.approval_note ?? null,
    followUpDueAt: followUpDueAt ? followUpDueAt.toISOString() : null,
    followUpRemindedAt: followUpDueAt ? nullableTimestamp(row.followup_reminded_at) : null,
    followUpDue: !!followUpDueAt && followUpDueAt.getTime() <= now.getTime(),
  };
}

/** Admin, autore del preventivo o rappresentante assegnatario del cliente (RAP). */
export function canManageQuotation(
  db: Database.Database,
  payload: { id: number; username: string; role: "admin" | "agente" },
  quotation: { agente: string; cliente_id: number | null }
): boolean {
  if (payload.role === "admin") return true;
  if (quotation.agente === payload.username) return true;
  return userOwnsCustomerByRap(db, payload.id, quotation.cliente_id);
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

export function listQuotations(
  db: Database.Database,
  options: { agente?: string | null; userId?: number | null } = {}
): Quotation[] {
  const rows = options.agente
    ? (db.prepare(
        `SELECT quotations.*, users.full_name AS agente_full_name
         FROM quotations
         LEFT JOIN users ON users.username = quotations.agente
         WHERE quotations.agente = ?
            OR EXISTS (
              SELECT 1 FROM anagrafiche a
              JOIN rap_assignments ra ON ra.rap = a.rap
              WHERE a.id = quotations.cliente_id AND ra.user_id = ?
            )
         ORDER BY datetime(quotations.created_at) DESC, quotations.id DESC`
      ).all(options.agente, options.userId ?? -1) as DbQuotation[])
    : (db.prepare(
        `SELECT quotations.*, users.full_name AS agente_full_name
         FROM quotations
         LEFT JOIN users ON users.username = quotations.agente
         ORDER BY datetime(quotations.created_at) DESC, quotations.id DESC`
      ).all() as DbQuotation[]);

  const followUpConfig = getFollowUpSettings();
  const now = new Date();
  return rows.map((row) => dbQuotationToQuotation(row, followUpConfig, now));
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

export function createQuotation(db: Database.Database, data: QuotationWriteData, state: QuotationSubmitState): Quotation {
  const quotationNumber = nextQuotationNumber(db, data.dataPreventivo);
  const result = db
    .prepare(
      `INSERT INTO quotations (numero, cliente, cliente_id, data_preventivo, data_consegna_prevista, luogo_consegna, validita_giorni, note, agente, items,
                               status, approval_requested_at, approval_decided_at, approval_decided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      quotationNumber,
      data.cliente,
      data.clienteId,
      data.dataPreventivo,
      data.dataConsegnaPrevista,
      data.luogoConsegna,
      data.validitaGiorni,
      data.note,
      data.agente,
      JSON.stringify(data.items),
      state.status,
      state.approvalRequestedAt,
      state.approvalDecidedAt,
      state.approvalDecidedBy
    );

  const quotation = getQuotation(db, result.lastInsertRowid as number);
  if (!quotation) throw new Error("Preventivo non trovato dopo il salvataggio");
  return quotation;
}

export function updateQuotation(
  db: Database.Database,
  id: number,
  data: Omit<QuotationWriteData, "agente">,
  state: QuotationSubmitState
): Quotation | null {
  const stmt = db.prepare(
    `UPDATE quotations
     SET cliente = ?, cliente_id = ?, data_preventivo = ?, data_consegna_prevista = ?, luogo_consegna = ?, validita_giorni = ?, note = ?, items = ?,
         status = ?, approval_requested_at = ?, approval_decided_at = ?, approval_decided_by = ?, approval_note = NULL,
         updated_at = datetime('now')
     WHERE id = ?`
  );
  const result = stmt.run(
    data.cliente,
    data.clienteId,
    data.dataPreventivo,
    data.dataConsegnaPrevista,
    data.luogoConsegna,
    data.validitaGiorni,
    data.note,
    JSON.stringify(data.items),
    state.status,
    state.approvalRequestedAt,
    state.approvalDecidedAt,
    state.approvalDecidedBy,
    id
  );

  if (result.changes === 0) return null;
  return getQuotation(db, id);
}

export function deleteQuotation(db: Database.Database, id: number): number {
  return db.transaction(() => {
    db.prepare("DELETE FROM quotation_followups WHERE quotation_id = ?").run(id);
    return db.prepare("DELETE FROM quotations WHERE id = ?").run(id).changes;
  })();
}

/** Segna il preventivo come trasformato: solo un preventivo attivo (approvato) può essere convertito. */
export function markQuotationConverted(db: Database.Database, quotationId: number, orderId: number): number {
  return db.prepare(
    `UPDATE quotations
     SET status = 'convertito', converted_order_id = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'attivo'`
  ).run(orderId, quotationId).changes;
}

/** Decisione admin su un preventivo in attesa; restituisce il numero di righe aggiornate (0 = non più in attesa). */
export function decideQuotationApproval(
  db: Database.Database,
  quotationId: number,
  action: "approve" | "reject",
  admin: string,
  note: string
): number {
  const nextStatus: QuotationStatus = action === "approve" ? "attivo" : "rifiutato";
  return db
    .prepare(
      `UPDATE quotations
       SET status = ?, approval_decided_at = ?, approval_decided_by = ?, approval_note = ?, updated_at = datetime('now')
       WHERE id = ? AND status = 'in_approvazione'`
    )
    .run(nextStatus, new Date().toISOString(), admin, note || null, quotationId).changes;
}
