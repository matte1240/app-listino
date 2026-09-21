import type Database from "better-sqlite3";
import type { PushPayload } from "@/lib/notifications";

/**
 * Invio notifiche push PWA. Placeholder fino alla configurazione di web-push:
 * senza chiavi VAPID le notifiche push sono disattivate e resta l'email.
 */
export function isPushConfigured(): boolean {
  return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

export async function sendPushToUsers(_db: Database.Database, _userIds: number[], _payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
}
