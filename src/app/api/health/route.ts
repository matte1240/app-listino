import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[health] DB non disponibile:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
