import { getDb } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-url";
import { notifyAgentQuotationFollowUps } from "@/lib/notifications";
import { calculateOrderDiscountedTotal } from "@/lib/order-totals";
import { findQuotationsDueForFollowUp, markFollowUpReminded } from "@/lib/quotation-followups";
import { parseQuotationItems, type DbQuotation } from "@/lib/quotations";
import { getFollowUpSettings } from "@/lib/settings";
import type { FollowUpMailQuotation } from "@/lib/mail";

/**
 * Promemoria di ricontatto dei preventivi non trasformati in ordine.
 * Controllo ogni ora; l'invio avviene solo nei giorni feriali in orario d'ufficio (fuso del container, TZ),
 * con un'unica email riepilogativa per rappresentante.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 2 * 60 * 1000;
const WORK_HOUR_START = 8;
const WORK_HOUR_END = 18;

let schedulerStarted = false;
let cycleRunning = false;

export interface FollowUpCycleResult {
  skipped?: "disabled" | "outside_hours" | "running";
  agents: number;
  quotations: number;
  failedAgents: number;
}

function isWorkingTime(now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= WORK_HOUR_START && hour < WORK_HOUR_END;
}

function validUntil(row: DbQuotation): string {
  const start = new Date(`${row.data_preventivo || row.created_at.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return "";
  start.setUTCDate(start.getUTCDate() + (row.validita_giorni ?? 30));
  return start.toISOString().slice(0, 10);
}

/** Esegue un ciclo di promemoria; con `force` ignora la finestra oraria (avvio manuale dall'admin). */
export async function runQuotationFollowUpCycle(options: { force?: boolean; now?: Date } = {}): Promise<FollowUpCycleResult> {
  const now = options.now ?? new Date();
  const empty: FollowUpCycleResult = { agents: 0, quotations: 0, failedAgents: 0 };
  if (cycleRunning) return { ...empty, skipped: "running" };

  const config = getFollowUpSettings();
  if (!config.followUpEnabled) return { ...empty, skipped: "disabled" };
  if (!options.force && !isWorkingTime(now)) return { ...empty, skipped: "outside_hours" };

  cycleRunning = true;
  try {
    const db = getDb();
    const due = findQuotationsDueForFollowUp(db, config, now);
    if (due.length === 0) return empty;

    const lastNoteStmt = db.prepare(
      `SELECT note FROM quotation_followups
       WHERE quotation_id = ? AND kind IN ('trattativa', 'riaperto') AND note != ''
       ORDER BY datetime(created_at) DESC, id DESC LIMIT 1`
    );
    const byAgent = new Map<string, DbQuotation[]>();
    for (const row of due) {
      const list = byAgent.get(row.agente) ?? [];
      list.push(row);
      byAgent.set(row.agente, list);
    }

    const baseUrl = getAppBaseUrl();
    const result: FollowUpCycleResult = { ...empty };
    for (const [agente, rows] of byAgent) {
      const quotations: FollowUpMailQuotation[] = rows.map((row) => ({
        id: row.id,
        numero: row.numero || `PREV-${row.id}`,
        cliente: row.cliente,
        luogoConsegna: row.luogo_consegna ?? "",
        dataPreventivo: row.data_preventivo,
        validoFino: validUntil(row),
        totale: calculateOrderDiscountedTotal(parseQuotationItems(row.items)),
        ultimaNota: (lastNoteStmt.get(row.id) as { note: string } | undefined)?.note ?? "",
      }));

      const delivered = await notifyAgentQuotationFollowUps(db, agente, {
        agenteFullName: rows[0].agente_full_name || agente,
        quotations,
        baseUrl,
      });
      if (!delivered) {
        result.failedAgents += 1;
        continue;
      }
      markFollowUpReminded(db, rows.map((row) => row.id), now);
      result.agents += 1;
      result.quotations += rows.length;
    }

    console.info(
      `[preventivi] Promemoria ricontatto: ${result.quotations} preventivi a ${result.agents} rappresentanti` +
        (result.failedAgents ? ` (${result.failedAgents} invii falliti, riprovo al prossimo ciclo)` : "")
    );
    return result;
  } finally {
    cycleRunning = false;
  }
}

function runCycleSafe() {
  runQuotationFollowUpCycle().catch((error) => {
    console.error("[preventivi] Errore ciclo promemoria ricontatto:", error);
  });
}

export function ensureQuotationFollowUpSchedulerStarted() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Nessun invio durante `next build` (raccolta dati delle pagine).
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const firstTimer = setTimeout(runCycleSafe, FIRST_CHECK_DELAY_MS);
  firstTimer.unref?.();
  const intervalTimer = setInterval(runCycleSafe, CHECK_INTERVAL_MS);
  intervalTimer.unref?.();

  console.info("[preventivi] Scheduler promemoria ricontatto avviato: controllo ogni ora (invio lun–ven 8–18)");
}
