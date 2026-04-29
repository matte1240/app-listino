import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession();
  
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  const db = getDb();

  try {
    // Total orders
    const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number };
    
    // Orders by status
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM orders 
      GROUP BY status
    `).all() as { status: string; count: number }[];

    const countsMap = statusCounts.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {} as Record<string, number>);

    // Total unique customers
    const uniqueCustomers = db.prepare("SELECT COUNT(DISTINCT cliente) as count FROM orders").get() as { count: number };

    // This month orders (approximate)
    const thisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM orders 
      WHERE created_at >= date('now', 'start of month')
    `).get() as { count: number };

    const stats = {
      totalOrders: totalOrders.count,
      bozze: countsMap.bozza || 0,
      inLavorazione: countsMap.in_lavorazione || 0,
      spediti: countsMap.spedito || 0,
      consegnati: countsMap.consegnato || 0,
      annullati: countsMap.annullato || 0,
      totalCustomers: uniqueCustomers.count,
      thisMonthOrders: thisMonth.count,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Errore nel recupero statistiche" }, { status: 500 });
  }
}
