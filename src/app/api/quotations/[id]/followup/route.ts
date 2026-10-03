import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canManageQuotation, getDbQuotation, getQuotation } from "@/lib/quotations";
import {
  FOLLOWUP_SNOOZE_DAYS,
  listQuotationFollowUps,
  markQuotationLost,
  reopenQuotation,
  snoozeQuotationFollowUp,
  type FollowUpActionResult,
} from "@/lib/quotation-followups";
import { getFollowUpSettings } from "@/lib/settings";

function parseQuotationId(id: string) {
  const quotationId = parseInt(id, 10);
  return Number.isNaN(quotationId) ? null : quotationId;
}

function normalizeSnoozeDays(value: unknown, fallback: number): number {
  const days = Number(value);
  return (FOLLOWUP_SNOOZE_DAYS as readonly number[]).includes(days) ? days : fallback;
}

async function loadAuthorized(req: NextRequest, id: string) {
  const auth = await requireUser(req);
  if (auth.error) return { error: auth.error };

  const quotationId = parseQuotationId(id);
  if (!quotationId) return { error: NextResponse.json({ error: "ID non valido" }, { status: 400 }) };

  const db = getDb();
  const row = getDbQuotation(db, quotationId);
  if (!row) return { error: NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 }) };
  if (!canManageQuotation(db, auth.payload, row)) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }) };
  }
  return { db, quotationId, payload: auth.payload, error: undefined };
}

/** GET /api/quotations/[id]/followup — storico ricontatti del preventivo */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAuthorized(req, id);
  if (ctx.error) return ctx.error;

  return NextResponse.json({ followUps: listQuotationFollowUps(ctx.db, ctx.quotationId) });
}

/**
 * POST /api/quotations/[id]/followup — esito del ricontatto
 * body: { action: "trattativa", note, days } | { action: "perso", note } | { action: "riapri", note?, days? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAuthorized(req, id);
  if (ctx.error) return ctx.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const note = typeof body.note === "string" ? body.note.trim() : "";
  const defaultDays = getFollowUpSettings().followUpDays;
  let result: FollowUpActionResult;

  switch (body.action) {
    case "trattativa":
      if (!note) return NextResponse.json({ error: "Scrivi un'osservazione sul ricontatto" }, { status: 400 });
      result = snoozeQuotationFollowUp(ctx.db, ctx.quotationId, normalizeSnoozeDays(body.days, defaultDays), note, ctx.payload.username);
      break;
    case "perso":
      if (!note) return NextResponse.json({ error: "Indica il motivo per cui il preventivo è perso" }, { status: 400 });
      result = markQuotationLost(ctx.db, ctx.quotationId, note, ctx.payload.username);
      break;
    case "riapri":
      result = reopenQuotation(ctx.db, ctx.quotationId, normalizeSnoozeDays(body.days, defaultDays), note, ctx.payload.username);
      break;
    default:
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({
    quotation: getQuotation(ctx.db, ctx.quotationId),
    followUps: listQuotationFollowUps(ctx.db, ctx.quotationId),
  });
}
