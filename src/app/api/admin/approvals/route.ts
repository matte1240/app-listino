import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { countPendingApprovals, listPendingApprovals } from "@/lib/approvals";

/** GET /api/admin/approvals — documenti in attesa di approvazione (solo admin). `?count=1` restituisce solo il conteggio. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const db = getDb();
  if (req.nextUrl.searchParams.get("count") === "1") {
    return NextResponse.json({ count: countPendingApprovals(db) }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(listPendingApprovals(db), { headers: { "Cache-Control": "no-store" } });
}
