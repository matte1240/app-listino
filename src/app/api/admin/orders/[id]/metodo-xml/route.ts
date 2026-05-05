import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { dbOrderToOrder, type DbOrder } from "@/lib/orders";
import { buildMetodoOrderXml } from "@/lib/metodo-xml";

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
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!row) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  const order = dbOrderToOrder(row);

  if (!order.clienteId) {
    return NextResponse.json(
      { error: "L'ordine non è collegato a un'anagrafica: codice cliente Metodo non disponibile." },
      { status: 422 }
    );
  }

  const anagrafica = db
    .prepare("SELECT codice FROM anagrafiche WHERE id = ?")
    .get(order.clienteId) as { codice: string | null } | undefined;

  if (!anagrafica?.codice) {
    return NextResponse.json(
      { error: "Anagrafica del cliente senza codice: impossibile generare numana." },
      { status: 422 }
    );
  }

  const xml = buildMetodoOrderXml({ order, codiceCliente: anagrafica.codice });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="ordine-metodo-${order.id}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
