import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { decideQuotationApproval, getQuotation } from "@/lib/quotations";
import { getAppBaseUrl } from "@/lib/app-url";
import { notifyAgentApprovalDecided, quotationApprovalDoc } from "@/lib/notifications";

function parseDecision(body: unknown): { action: "approve" | "reject"; note: string } | null {
  if (!body || typeof body !== "object") return null;
  const { action, note } = body as { action?: unknown; note?: unknown };
  if (action !== "approve" && action !== "reject") return null;
  return { action, note: typeof note === "string" ? note.trim().slice(0, 1000) : "" };
}

/** POST /api/quotations/[id]/approval — approva o rifiuta un preventivo in attesa (solo admin) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const admin = auth.payload;

  const { id } = await params;
  const quotationId = parseInt(id, 10);
  if (isNaN(quotationId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const decision = parseDecision(await req.json().catch(() => null));
  if (!decision) return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  const db = getDb();
  const changes = decideQuotationApproval(db, quotationId, decision.action, admin.username, decision.note);
  if (changes === 0) {
    const exists = getQuotation(db, quotationId);
    if (!exists) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
    return NextResponse.json({ error: "Il preventivo non è in attesa di approvazione" }, { status: 409 });
  }

  const quotation = getQuotation(db, quotationId);
  if (!quotation) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });

  const outcome = decision.action === "approve" ? "approvato" : "rifiutato";
  notifyAgentApprovalDecided(db, quotationApprovalDoc(quotation, getAppBaseUrl(req)), outcome, decision.note, admin.fullName || admin.username).catch(
    (err) => console.error("[approvazioni] Errore notifica agente:", err)
  );

  return NextResponse.json({ quotation, decision: outcome });
}
