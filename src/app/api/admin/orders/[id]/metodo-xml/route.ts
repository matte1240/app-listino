import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { dbOrderToOrder, type DbOrder } from "@/lib/orders";
import { buildMetodoOrderXmlForOrder } from "@/lib/metodo-xml";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) {
    return NextResponse.json({ error: "ID ordine non valido" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare(
    `SELECT orders.*, users.full_name AS agente_full_name
     FROM orders
     LEFT JOIN users ON users.username = orders.agente
     WHERE orders.id = ?`
  ).get(orderId) as DbOrder | undefined;
  if (!row) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  const order = dbOrderToOrder(row);
  const result = buildMetodoOrderXmlForOrder(order);

  if (!result.ok) {
    const error =
      result.reason === "no_cliente"
        ? "L'ordine non è collegato a un'anagrafica: codice cliente Metodo non disponibile."
        : "Anagrafica del cliente senza codice: impossibile generare numana.";
    return NextResponse.json({ error }, { status: 422 });
  }

  return new NextResponse(result.xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
