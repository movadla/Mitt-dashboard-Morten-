import { NextRequest, NextResponse } from "next/server";
import { addHighlight, removeHighlight } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : null;
  const text = typeof body?.text === "string" ? body.text : null;
  const action = body?.action === "remove" ? "remove" : "add";
  if (!date || !text) return NextResponse.json({ error: "Mangler dato/tekst" }, { status: 400 });

  const tip = action === "remove" ? await removeHighlight(date, text) : await addHighlight(date, text);
  if (!tip) return NextResponse.json({ error: "Fant ikke tipset" }, { status: 404 });
  return NextResponse.json({ tip });
}
