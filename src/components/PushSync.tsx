"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { syncExistingPushSubscription } from "@/lib/push-client";

/**
 * Dopo il login riassegna all'utente corrente la sottoscrizione push già presente nel browser
 * (dispositivi condivisi: la notifica arriva a chi è loggato adesso).
 */
export default function PushSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void syncExistingPushSubscription();
  }, [user]);

  return null;
}
