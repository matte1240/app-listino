import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { userOwnsCustomerByRap } from "@/lib/rap";

interface DestinationRow {
  luogo_consegna: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const clienteId = Number.parseInt(id, 10);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: "ID cliente non valido" }, { status: 400 });
  }

  const limitRaw = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "8", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;

  const db = getDb();

  // Admin or agente whose Rap owns the customer sees all destinations; other agenti only see their own.
  const seesAll = payload.role === "admin" || userOwnsCustomerByRap(db, payload.id, clienteId);

  const baseSql = `
    SELECT luogo_consegna
    FROM orders
    WHERE cliente_id = ?
      AND TRIM(luogo_consegna) <> ''
      ${seesAll ? "" : "AND agente = ?"}
    GROUP BY luogo_consegna
    ORDER BY MAX(created_at) DESC
    LIMIT ?
  `;

  const rows = seesAll
    ? (db.prepare(baseSql).all(clienteId, limit) as DestinationRow[])
    : (db.prepare(baseSql).all(clienteId, payload.username, limit) as DestinationRow[]);

  return NextResponse.json({
    destinations: rows.map((r) => r.luogo_consegna).filter(Boolean),
  });
}
