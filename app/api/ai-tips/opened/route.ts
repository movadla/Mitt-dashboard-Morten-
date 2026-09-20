import { NextRequest, NextResponse } from "next/server";
import { markTipOpened } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : null;
  if (!date) return NextResponse.json({ error: "Mangler dato" }, { status: 400 });
  await markTipOpened(date);
  return NextResponse.json({ ok: true });
}
