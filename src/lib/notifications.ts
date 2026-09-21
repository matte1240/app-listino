import type Database from "better-sqlite3";
import { getAdminRecipients } from "@/lib/approvals";
import { getUserEmailByUsername } from "@/lib/orders";
import { sendApprovalDecisionEmail, sendApprovalRequestEmail, type ApprovalMailDoc } from "@/lib/mail";
import type { PushPayload } from "@/lib/push";
import type { Order, OrderHistoryItem, Quotation } from "@/types";

/**
 * Notifiche del flusso di approvazione (email; il push PWA si aggancia qui).
 * Tutte le funzioni sono pensate per essere chiamate fire-and-forget dalle route.
 */

export type ApprovalNotificationDoc = ApprovalMailDoc;

export async function notifyAdminsApprovalRequested(db: Database.Database, doc: ApprovalNotificationDoc): Promise<void> {
  const recipients = getAdminRecipients(db);
  if (recipients.emails.length === 0) {
    console.warn("[approvazioni] Nessun admin con email configurata: la richiesta resta visibile solo nel pannello admin");
  }

  await Promise.allSettled([
    sendApprovalRequestEmail(recipients.emails, doc).catch((err) =>
      console.error("[mail] Errore invio email richiesta approvazione:", err)
    ),
    sendPushToUsersSafe(db, recipients.ids, {
      title: `Approvazione richiesta`,
      body: `${doc.agenteFullName || doc.agenteUsername} · ${docTitle(doc)} · ${doc.cliente}`,
      url: "/admin/approvazioni",
      tag: `approval-request-${doc.kind}-${doc.id}`,
    }),
  ]);
}

export async function notifyAgentApprovalDecided(
  db: Database.Database,
  doc: ApprovalNotificationDoc,
  decision: "approvato" | "rifiutato",
  note: string,
  decidedBy: string
): Promise<void> {
  const email = getUserEmailByUsername(db, doc.agenteUsername);
  const agentRow = db.prepare("SELECT id FROM users WHERE username = ?").get(doc.agenteUsername) as { id: number } | undefined;

  await Promise.allSettled([
    email
      ? sendApprovalDecisionEmail(email, doc, decision, note, decidedBy).catch((err) =>
          console.error("[mail] Errore invio email esito approvazione:", err)
        )
      : Promise.resolve(),
    agentRow
      ? sendPushToUsersSafe(db, [agentRow.id], {
          title: `${docTitle(doc)} ${decision}`,
          body: note ? `${doc.cliente} · ${note}` : doc.cliente,
          url: doc.kind === "preventivo" ? `/quotations/${doc.id}` : "/orders",
          tag: `approval-decision-${doc.kind}-${doc.id}`,
        })
      : Promise.resolve(),
  ]);
}

function docTitle(doc: ApprovalNotificationDoc): string {
  if (doc.kind === "preventivo") return `Preventivo ${doc.numero || `#${doc.id}`}`;
  if (doc.kind === "modifica") return `Modifica ordine #${doc.id}`;
  return `Ordine #${doc.id}`;
}

/** Invio push (web-push); silenzioso se non configurato o in caso di errore. */
async function sendPushToUsersSafe(db: Database.Database, userIds: number[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers(db, userIds, payload);
  } catch (err) {
    console.error("[push] Errore invio notifica push:", err);
  }
}

/** Documento di notifica per un ordine (nuovo o modifica in attesa). */
export function orderApprovalDoc(
  order: Pick<Order, "id" | "cliente" | "agente" | "agenteFullName" | "items">,
  baseUrl: string,
  kind: "ordine" | "modifica" = "ordine",
  items: OrderHistoryItem[] = order.items
): ApprovalNotificationDoc {
  return {
    kind,
    id: order.id,
    cliente: order.cliente,
    agenteUsername: order.agente,
    agenteFullName: order.agenteFullName || order.agente,
    items,
    baseUrl,
  };
}

/** Documento di notifica per un preventivo. */
export function quotationApprovalDoc(
  quotation: Pick<Quotation, "id" | "numero" | "cliente" | "agente" | "agenteFullName" | "items">,
  baseUrl: string
): ApprovalNotificationDoc {
  return {
    kind: "preventivo",
    id: quotation.id,
    numero: quotation.numero,
    cliente: quotation.cliente,
    agenteUsername: quotation.agente,
    agenteFullName: quotation.agenteFullName || quotation.agente,
    items: quotation.items,
    baseUrl,
  };
}
