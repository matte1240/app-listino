import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

interface AssignmentRow {
  rap: number;
  user_id: number;
  username: string;
  full_name: string;
}

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const db = getDb();

  const assignments = db
    .prepare(
      `SELECT ra.rap, ra.user_id, u.username, u.full_name
       FROM rap_assignments ra
       JOIN users u ON u.id = ra.user_id
       ORDER BY ra.rap`
    )
    .all() as AssignmentRow[];

  const usedRapRows = db
    .prepare("SELECT DISTINCT rap FROM anagrafiche WHERE rap IS NOT NULL ORDER BY rap")
    .all() as { rap: number }[];

  return NextResponse.json({
    assignments: assignments.map((row) => ({
      rap: row.rap,
      userId: row.user_id,
      username: row.username,
      fullName: row.full_name || row.username,
    })),
    usedRapNumbers: usedRapRows.map((r) => r.rap),
  });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const rap = Number(body.rap);
  if (!Number.isInteger(rap) || rap < 1) {
    return NextResponse.json({ error: "Numero Rap non valido" }, { status: 400 });
  }

  const rawUserId = body.userId;
  const db = getDb();

  if (rawUserId === null || rawUserId === undefined || rawUserId === "") {
    db.prepare("DELETE FROM rap_assignments WHERE rap = ?").run(rap);
    return NextResponse.json({ ok: true, rap, userId: null });
  }

  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Utente non valido" }, { status: 400 });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  db.prepare(
    `INSERT INTO rap_assignments (rap, user_id, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(rap) DO UPDATE SET user_id = excluded.user_id, updated_at = datetime('now')`
  ).run(rap, userId);

  return NextResponse.json({ ok: true, rap, userId });
}
