import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { verifyToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth";

const EXCEL_PATH = path.join(process.cwd(), "data", "listino.xlsx");

export async function GET() {
  if (!fs.existsSync(EXCEL_PATH)) {
    return new NextResponse(null, { status: 404 });
  }
  const buffer = fs.readFileSync(EXCEL_PATH);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=listino.xlsx",
    },
  });
}

export async function POST(req: NextRequest) {
  // Only admins can upload
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const buffer = Buffer.from(await (file as Blob).arrayBuffer());
  const dir = path.dirname(EXCEL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EXCEL_PATH, buffer);

  return NextResponse.json({ ok: true });
}
