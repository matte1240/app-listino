import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MAGAZZINI } from "@/types";

interface DbBranchEmail {
  magazzino: string;
  email_to: string;
  email_cc: string;
}

/** GET /api/branch-emails — list email config for all branches (admin only) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const db = getDb();
  const rows = db.prepare("SELECT * FROM branch_emails").all() as DbBranchEmail[];

  // Build a map with all magazzini, filling in defaults for missing ones
  const config: Record<string, { emailTo: string; emailCc: string }> = {};
  for (const m of MAGAZZINI) {
    config[m] = { emailTo: "", emailCc: "" };
  }
  for (const row of rows) {
    config[row.magazzino] = { emailTo: row.email_to, emailCc: row.email_cc };
  }

  return NextResponse.json({ config });
}

/** PUT /api/branch-emails — update email config for all branches (admin only) */
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.config || typeof body.config !== "object") {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO branch_emails (magazzino, email_to, email_cc) VALUES (?, ?, ?)
     ON CONFLICT(magazzino) DO UPDATE SET email_to = excluded.email_to, email_cc = excluded.email_cc`
  );

  const runAll = db.transaction(() => {
    for (const magazzino of MAGAZZINI) {
      const entry = body.config[magazzino];
      if (entry) {
        upsert.run(magazzino, (entry.emailTo ?? "").trim(), (entry.emailCc ?? "").trim());
      }
    }
  });
  runAll();

  return NextResponse.json({ ok: true });
}
