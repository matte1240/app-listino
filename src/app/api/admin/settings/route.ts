import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAppSettings, saveAppSettings, type AppSettings } from "@/lib/settings";

const MAX_CODE_LENGTH = 40;

/** Codici Metodo sempre maiuscoli: la pagina li mostra così ed è così che finiscono su righe ed export. */
function normalizeCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().toUpperCase().slice(0, MAX_CODE_LENGTH);
}

/** GET /api/admin/settings — impostazioni applicative (solo admin) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  return NextResponse.json({ settings: getAppSettings() });
}

/** PUT /api/admin/settings — aggiorna le impostazioni applicative (solo admin) */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const partial: Partial<AppSettings> = {};
  const codiceTrasporto = normalizeCode(body.metodoCodiceTrasporto);
  const codiceManuale = normalizeCode(body.metodoCodiceManuale);
  if (codiceTrasporto !== undefined) partial.metodoCodiceTrasporto = codiceTrasporto;
  if (codiceManuale !== undefined) partial.metodoCodiceManuale = codiceManuale;

  const settings = saveAppSettings(partial);
  return NextResponse.json({ settings });
}
