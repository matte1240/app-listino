"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPushPublicKey,
  getCurrentPushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

interface Props {
  className?: string;
  onDone?: () => void;
}

type PushState = "loading" | "unavailable" | "unsupported" | "denied" | "off" | "on";

/**
 * Attiva/disattiva le notifiche push su questo dispositivo.
 * Nascosto se il server non ha le chiavi VAPID; disabilitato se il browser non supporta il push
 * (su iPhone serve l'app installata in Home).
 */
export default function PushToggle({ className, onDone }: Props) {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await fetchPushPublicKey();
      if (cancelled) return;
      if (!key) {
        setState("unavailable");
        return;
      }
      setPublicKey(key);
      if (!isPushSupported()) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const subscription = await getCurrentPushSubscription();
      if (!cancelled) setState(subscription && Notification.permission === "granted" ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading" || state === "unavailable") return null;

  async function handleClick() {
    if (busy || !publicKey) return;
    setBusy(true);
    try {
      if (state === "on") {
        await unsubscribeFromPush({ removeFromBrowser: true });
        setState("off");
        toast.success("Notifiche disattivate su questo dispositivo");
      } else {
        const result = await subscribeToPush(publicKey);
        if (result.ok) {
          setState("on");
          toast.success("Notifiche attivate su questo dispositivo");
        } else {
          if (Notification.permission === "denied") setState("denied");
          toast.error(result.reason ?? "Impossibile attivare le notifiche");
        }
      }
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile aggiornare le notifiche");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || state === "unsupported" || state === "denied";
  const label =
    state === "on"
      ? "Disattiva notifiche"
      : state === "unsupported"
        ? "Notifiche non supportate"
        : state === "denied"
          ? "Notifiche bloccate dal browser"
          : "Attiva notifiche";
  const Icon = busy ? Loader2 : state === "on" ? BellRing : state === "off" ? Bell : BellOff;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={
        state === "unsupported"
          ? "Su iPhone/iPad installa prima l'app nella schermata Home"
          : state === "denied"
            ? "Sblocca le notifiche dalle impostazioni del browser"
            : undefined
      }
      className={className}
    >
      <Icon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {label}
    </button>
  );
}
