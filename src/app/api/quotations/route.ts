import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createQuotation, listQuotations } from "@/lib/quotations";
import { parseLocalizedNumber } from "@/lib/utils";
import type { QuotationItem, ValiditaPreventivoGiorni } from "@/types";

async function getAuthPayload(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

function normalizeItems(items: unknown): QuotationItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const raw = item as Partial<QuotationItem>;
      const qty = parseLocalizedNumber(raw.qty);
      const prezzoListino = parseLocalizedNumber(raw.prezzoListino);
      const sconto = raw.sconto === 8 || raw.sconto === 15 ? raw.sconto : 0;

      return {
        codice: String(raw.codice ?? "").trim(),
        descrizione: String(raw.descrizione ?? "").trim(),
        qty: Math.max(0, qty),
        um: String(raw.um ?? "").trim(),
        prezzoListino,
        sconto,
      } satisfies QuotationItem;
    })
    .filter((item) => item.codice && item.qty > 0);
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

  const items = normalizeItems(body.items);
  const dataPreventivo = today();
  const dataConsegnaPrevista = String(body.dataConsegnaPrevista ?? "").trim() || today();
  const validitaGiorni = normalizeValiditaGiorni(body.validitaGiorni);

  if (!customer.cliente || !dataPreventivo || items.length === 0) {
    return NextResponse.json({ error: "Dati preventivo incompleti" }, { status: 400 });
  }

  try {
    const quotation = createQuotation(db, {
      cliente: customer.cliente,
      clienteId: customer.clienteId,
      dataPreventivo,
      dataConsegnaPrevista,
      validitaGiorni,
      note: String(body.note ?? ""),
      agente: payload.username,
      items,
    });

    return NextResponse.json({ quotation, id: quotation.id }, { status: 201 });
  } catch (error) {
    console.error("[quotations] Errore creazione preventivo:", error);
    return NextResponse.json({ error: "Errore creazione preventivo" }, { status: 500 });
  }
}