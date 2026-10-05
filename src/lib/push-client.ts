"use client";

/**
 * Helper lato browser per le notifiche push PWA.
 * Richiede HTTPS (o localhost); su iPhone/iPad funziona solo con l'app installata in Home (iOS 16.4+).
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function fetchPushPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/public-key", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.publicKey === "string" && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function registerSubscription(subscription: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  return res.ok;
}

/** Chiede il permesso (da un gesto utente), sottoscrive il browser e registra la sottoscrizione sul server. */
export async function subscribeToPush(publicKey: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "Notifiche non supportate da questo browser" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Permesso notifiche negato" };

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const registered = await registerSubscription(subscription);
  return registered ? { ok: true } : { ok: false, reason: "Registrazione sul server non riuscita" };
}

/** Riassegna all'utente loggato una sottoscrizione già presente nel browser (es. dopo un nuovo login). */
export async function syncExistingPushSubscription(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  await registerSubscription(subscription).catch(() => false);
}

/** Rimuove la sottoscrizione dal server (e, se richiesto, dal browser). */
export async function unsubscribeFromPush(options: { removeFromBrowser?: boolean } = {}): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});
  if (options.removeFromBrowser) {
    await subscription.unsubscribe().catch(() => false);
  }
}
