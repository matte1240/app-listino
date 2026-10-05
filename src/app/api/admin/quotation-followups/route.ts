import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runQuotationFollowUpCycle } from "@/lib/quotation-followup-scheduler";

/** POST /api/admin/quotation-followups — invia subito i promemoria scaduti, anche fuori orario (solo admin) */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const result = await runQuotationFollowUpCycle({ force: true });
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[preventivi] Errore invio manuale promemoria:", error);
    return NextResponse.json({ error: "Errore durante l'invio dei promemoria" }, { status: 500 });
  }
}
