import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";

/** GET /api/push/public-key — chiave pubblica VAPID (null se il push non è configurato) */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  return NextResponse.json(
    { publicKey: isPushConfigured() ? getVapidPublicKey() : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
