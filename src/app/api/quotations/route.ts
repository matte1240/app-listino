import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createQuotation, listQuotations } from "@/lib/quotations";
import { countArticleLines, normalizeOrderItems } from "@/lib/order-lines";
import { getLineCodes } from "@/lib/settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { resolveQuotationSubmitState } from "@/lib/approvals";
import { notifyAdminsApprovalRequested, quotationApprovalDoc } from "@/lib/notifications";
import type { ValiditaPreventivoGiorni } from "@/types";

async function getAuthPayload(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

async function resolveCustomer(db: ReturnType<typeof getDb>, clienteId: unknown, cliente: unknown) {
  const normalizedClienteId = Number(clienteId);
  const hasSelectedCustomer = Number.isInteger(normalizedClienteId) && normalizedClienteId > 0;

  if (!hasSelectedCustomer) {
    return { clienteId: null, cliente: String(cliente ?? "").trim() };
  }

  const selectedCustomer = db
    .prepare("SELECT id, ragione_sociale FROM anagrafiche WHERE id = ?")
    .get(normalizedClienteId) as { id: number; ragione_sociale: string } | undefined;

  if (!selectedCustomer) return null;
  return { clienteId: selectedCustomer.id, cliente: selectedCustomer.ragione_sociale };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeValiditaGiorni(value: unknown): ValiditaPreventivoGiorni {
  const normalized = Number(value);
  return normalized === 7 || normalized === 15 || normalized === 30 ? normalized : 30;
}

export async function GET(req: NextRequest) {
  const payload = await getAuthPayload(req);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const db = getDb();
  const quotations = listQuotations(db, {
    agente: payload.role === "admin" ? null : payload.username,
    userId: payload.role === "admin" ? null : payload.id,
  });

  return NextResponse.json({ quotations });
}

export async function POST(req: NextRequest) {
  const payload = await getAuthPayload(req);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const db = getDb();
  const customer = await resolveCustomer(db, body.clienteId, body.cliente);
  if (!customer) return NextResponse.json({ error: "Cliente anagrafica non trovato" }, { status: 400 });

  const items = normalizeOrderItems(body.items, getLineCodes());
  const dataPreventivo = today();
  const dataConsegnaPrevista = String(body.dataConsegnaPrevista ?? "").trim() || today();
  const validitaGiorni = normalizeValiditaGiorni(body.validitaGiorni);

  if (!customer.cliente || !dataPreventivo || countArticleLines(items) === 0) {
    return NextResponse.json({ error: "Dati preventivo incompleti" }, { status: 400 });
  }

  try {
    // Sconti liberi → il preventivo nasce "in approvazione" (salvo admin).
    const submitState = resolveQuotationSubmitState(items, payload);
    const quotation = createQuotation(
      db,
      {
        cliente: customer.cliente,
        clienteId: customer.clienteId,
        dataPreventivo,
        dataConsegnaPrevista,
        luogoConsegna: String(body.luogoConsegna ?? "").trim(),
        validitaGiorni,
        note: String(body.note ?? ""),
        agente: payload.username,
        items,
      },
      submitState
    );

    if (quotation.status === "in_approvazione") {
      notifyAdminsApprovalRequested(db, quotationApprovalDoc(quotation, getAppBaseUrl(req))).catch((err) =>
        console.error("[approvazioni] Errore notifica admin:", err)
      );
    }

    return NextResponse.json({ quotation, id: quotation.id, status: quotation.status }, { status: 201 });
  } catch (error) {
    console.error("[quotations] Errore creazione preventivo:", error);
    return NextResponse.json({ error: "Errore creazione preventivo" }, { status: 500 });
  }
}