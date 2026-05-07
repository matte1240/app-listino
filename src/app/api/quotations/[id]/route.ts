import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { dbQuotationToQuotation, deleteQuotation, getDbQuotation, updateQuotation } from "@/lib/quotations";
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
      const qty = Number(raw.qty);
      const prezzoListino = Number(raw.prezzoListino);
      const sconto = raw.sconto === 8 || raw.sconto === 15 ? raw.sconto : 0;

      return {
        codice: String(raw.codice ?? "").trim(),
        descrizione: String(raw.descrizione ?? "").trim(),
        qty: Number.isFinite(qty) ? Math.max(0, qty) : 0,
        um: String(raw.um ?? "").trim(),
        prezzoListino: Number.isFinite(prezzoListino) ? prezzoListino : 0,
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

function parseQuotationId(id: string) {
  const quotationId = parseInt(id, 10);
  return Number.isNaN(quotationId) ? null : quotationId;
}

function normalizeValiditaGiorni(value: unknown): ValiditaPreventivoGiorni {
  const normalized = Number(value);
  return normalized === 7 || normalized === 15 || normalized === 30 ? normalized : 30;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthPayload(req);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const quotationId = parseQuotationId(id);
  if (!quotationId) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const row = getDbQuotation(db, quotationId);
  if (!row) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  if (payload.role !== "admin" && row.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  return NextResponse.json({ quotation: dbQuotationToQuotation(row) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthPayload(req);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const quotationId = parseQuotationId(id);
  if (!quotationId) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const existing = getDbQuotation(db, quotationId);
  if (!existing) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const customer = await resolveCustomer(db, body.clienteId, body.cliente);
  if (!customer) return NextResponse.json({ error: "Cliente anagrafica non trovato" }, { status: 400 });

  const items = normalizeItems(body.items);
  const dataPreventivo = String(existing.data_preventivo ?? new Date().toISOString().slice(0, 10)).trim();
  const dataConsegnaPrevista = String(body.dataConsegnaPrevista ?? "").trim() || String(existing.data_consegna_prevista ?? "").trim() || today();
  const validitaGiorni = normalizeValiditaGiorni(body.validitaGiorni);

  if (!customer.cliente || !dataPreventivo || items.length === 0) {
    return NextResponse.json({ error: "Dati preventivo incompleti" }, { status: 400 });
  }

  const quotation = updateQuotation(db, quotationId, {
    cliente: customer.cliente,
    clienteId: customer.clienteId,
    dataPreventivo,
    dataConsegnaPrevista,
    validitaGiorni,
    note: String(body.note ?? ""),
    items,
  });

  if (!quotation) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  return NextResponse.json({ quotation });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthPayload(req);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const quotationId = parseQuotationId(id);
  if (!quotationId) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const existing = getDbQuotation(db, quotationId);
  if (!existing) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const changes = deleteQuotation(db, quotationId);
  if (changes === 0) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });

  return NextResponse.json({ ok: true });
}