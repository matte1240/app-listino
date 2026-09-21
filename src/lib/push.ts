import type Database from "better-sqlite3";
import webpush, { WebPushError, type PushSubscription } from "web-push";

/**
 * Notifiche push PWA (Web Push + VAPID).
 * Senza VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY il push è disattivato in modo silenzioso e resta l'email.
 * Chiavi: `npx web-push generate-vapid-keys`.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Percorso relativo aperto al click sulla notifica (es. /admin/approvazioni). */
  url: string;
  /** Raggruppa le notifiche con lo stesso tag (sostituisce la precedente). */
  tag?: string;
}

interface DbPushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function isPushConfigured(): boolean {
  return !!process.env.VAPID_PUBLIC_KEY?.trim() && !!process.env.VAPID_PRIVATE_KEY?.trim();
}

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!vapidConfigured) {
    const subject = process.env.VAPID_SUBJECT?.trim() || `mailto:${process.env.GMAIL_USER?.trim() || "admin@example.com"}`;
    webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim());
    vapidConfigured = true;
  }
  return true;
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function upsertPushSubscription(db: Database.Database, userId: number, subscription: SubscriptionInput, userAgent: string): void {
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, updated_at = datetime('now')`
  ).run(userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent.slice(0, 255));
}

export function deletePushSubscription(db: Database.Database, endpoint: string): number {
  return db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint).changes;
}

/** Invia la notifica a tutte le sottoscrizioni degli utenti indicati; rimuove quelle scadute (404/410). */
export async function sendPushToUsers(db: Database.Database, userIds: number[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0 || !ensureVapid()) return;

  const placeholders = userIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`)
    .all(...userIds) as DbPushSubscription[];
  if (rows.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      const subscription: PushSubscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
      try {
        await webpush.sendNotification(subscription, body, { TTL: 60 * 60 * 24, urgency: "high" });
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
          return;
        }
        console.error("[push] Invio fallito per una sottoscrizione:", error instanceof Error ? error.message : error);
      }
    })
  );
}
