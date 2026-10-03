import type Database from "better-sqlite3";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import { addDays, isFollowUpReminderDue, type DbQuotation, type FollowUpConfig } from "@/lib/quotations";
import type { QuotationFollowUp, QuotationFollowUpKind } from "@/types";

/**
 * Ricontatto dei preventivi non trasformati in ordine: storico (`quotation_followups`),
 * esiti registrati dal rappresentante e selezione dei promemoria da inviare.
 */

export const FOLLOWUP_SNOOZE_DAYS = [7, 15, 30, 60] as const;
export const MAX_FOLLOWUP_NOTE_LENGTH = 2000;

interface DbQuotationFollowUp {
  id: number;
  quotation_id: number;
  kind: string;
  note: string;
  next_reminder_at: string | null;
  created_by: string;
  created_by_full_name: string | null;
  created_at: string;
}

const FOLLOWUP_KINDS: ReadonlySet<QuotationFollowUpKind> = new Set(["promemoria", "trattativa", "perso", "riaperto"]);

function toFollowUp(row: DbQuotationFollowUp): QuotationFollowUp {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    kind: FOLLOWUP_KINDS.has(row.kind as QuotationFollowUpKind) ? (row.kind as QuotationFollowUpKind) : "trattativa",
    note: row.note,
    nextReminderAt: row.next_reminder_at ? normalizeUtcTimestamp(row.next_reminder_at) : null,
    createdBy: row.created_by,
    createdByFullName: row.created_by_full_name || row.created_by,
    createdAt: normalizeUtcTimestamp(row.created_at),
  };
}

/** Storico del preventivo, dal più recente. */
export function listQuotationFollowUps(db: Database.Database, quotationId: number): QuotationFollowUp[] {
  const rows = db
    .prepare(
      `SELECT f.*, u.full_name AS created_by_full_name
       FROM quotation_followups f
       LEFT JOIN users u ON u.username = f.created_by
       WHERE f.quotation_id = ?
       ORDER BY datetime(f.created_at) DESC, f.id DESC`
    )
    .all(quotationId) as DbQuotationFollowUp[];
  return rows.map(toFollowUp);
}

function insertFollowUp(
  db: Database.Database,
  quotationId: number,
  kind: QuotationFollowUpKind,
  note: string,
  createdBy: string,
  nextReminderAt: string | null = null
) {
  db.prepare(
    `INSERT INTO quotation_followups (quotation_id, kind, note, next_reminder_at, created_by)
     VALUES (?, ?, ?, ?, ?)`
  ).run(quotationId, kind, note.trim().slice(0, MAX_FOLLOWUP_NOTE_LENGTH), nextReminderAt, createdBy);
}

export type FollowUpActionResult = { ok: true } | { ok: false; error: string };

/** Cliente ricontattato, trattativa ancora aperta: annota e sposta il prossimo promemoria. */
export function snoozeQuotationFollowUp(
  db: Database.Database,
  quotationId: number,
  days: number,
  note: string,
  username: string,
  now: Date = new Date()
): FollowUpActionResult {
  const nextReminderAt = addDays(now, days).toISOString();
  return db.transaction((): FollowUpActionResult => {
    const changes = db
      .prepare(
        `UPDATE quotations
         SET followup_due_at = ?, followup_reminded_at = NULL, updated_at = datetime('now')
         WHERE id = ? AND status = 'attivo'`
      )
      .run(nextReminderAt, quotationId).changes;
    if (changes === 0) return { ok: false, error: "Solo un preventivo attivo può restare in trattativa" };
    insertFollowUp(db, quotationId, "trattativa", note, username, nextReminderAt);
    return { ok: true };
  })();
}

/** Chiude il preventivo senza ordine (resta consultabile e riapribile). */
export function markQuotationLost(db: Database.Database, quotationId: number, note: string, username: string): FollowUpActionResult {
  return db.transaction((): FollowUpActionResult => {
    const changes = db
      .prepare(
        `UPDATE quotations
         SET status = 'perso', followup_reminded_at = NULL, updated_at = datetime('now')
         WHERE id = ? AND status = 'attivo'`
      )
      .run(quotationId).changes;
    if (changes === 0) return { ok: false, error: "Solo un preventivo attivo può essere chiuso come perso" };
    insertFollowUp(db, quotationId, "perso", note, username);
    return { ok: true };
  })();
}

/** Riporta attivo un preventivo perso, con un nuovo promemoria fra N giorni. */
export function reopenQuotation(
  db: Database.Database,
  quotationId: number,
  days: number,
  note: string,
  username: string,
  now: Date = new Date()
): FollowUpActionResult {
  const nextReminderAt = addDays(now, days).toISOString();
  return db.transaction((): FollowUpActionResult => {
    const changes = db
      .prepare(
        `UPDATE quotations
         SET status = 'attivo', followup_due_at = ?, followup_reminded_at = NULL, updated_at = datetime('now')
         WHERE id = ? AND status = 'perso'`
      )
      .run(nextReminderAt, quotationId).changes;
    if (changes === 0) return { ok: false, error: "Il preventivo non è chiuso come perso" };
    insertFollowUp(db, quotationId, "riaperto", note, username, nextReminderAt);
    return { ok: true };
  })();
}

/** Preventivi attivi il cui promemoria va inviato ora. */
export function findQuotationsDueForFollowUp(db: Database.Database, config: FollowUpConfig, now: Date = new Date()): DbQuotation[] {
  if (!config.followUpEnabled) return [];
  const rows = db
    .prepare(
      `SELECT quotations.*, users.full_name AS agente_full_name
       FROM quotations
       LEFT JOIN users ON users.username = quotations.agente
       WHERE quotations.status = 'attivo'
       ORDER BY datetime(quotations.created_at) ASC, quotations.id ASC`
    )
    .all() as DbQuotation[];
  return rows.filter((row) => isFollowUpReminderDue(row, config, now));
}

/** Registra l'invio del promemoria (per non ripeterlo prima di N giorni). */
export function markFollowUpReminded(db: Database.Database, quotationIds: number[], now: Date = new Date()): void {
  if (quotationIds.length === 0) return;
  const remindedAt = now.toISOString();
  const update = db.prepare("UPDATE quotations SET followup_reminded_at = ? WHERE id = ? AND status = 'attivo'");
  db.transaction(() => {
    for (const id of quotationIds) {
      if (update.run(remindedAt, id).changes > 0) {
        insertFollowUp(db, id, "promemoria", "", "");
      }
    }
  })();
}
