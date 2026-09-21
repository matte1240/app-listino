import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deletePushSubscription, isPushConfigured, upsertPushSubscription, type SubscriptionInput } from "@/lib/push";

function parseSubscription(raw: unknown): SubscriptionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** POST /api/push/subscriptions — registra (o riassegna all'utente corrente) la sottoscrizione del browser */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Notifiche push non configurate sul server" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const subscription = parseSubscription(body?.subscription ?? body);
  if (!subscription) return NextResponse.json({ error: "Sottoscrizione non valida" }, { status: 400 });

  upsertPushSubscription(getDb(), auth.payload.id, subscription, req.headers.get("user-agent") ?? "");
  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/subscriptions — rimuove la sottoscrizione (body: { endpoint }) */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Endpoint mancante" }, { status: 400 });

  const removed = deletePushSubscription(getDb(), endpoint);
  return NextResponse.json({ ok: true, removed });
}
