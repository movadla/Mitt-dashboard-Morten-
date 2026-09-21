import { NextRequest, NextResponse } from "next/server";
import { generateBackfillTip, AI_TIPS_CATEGORIES, type AiTipCategory } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Engangs-bootstrapping av arkivet på tvers av flere kategorier samtidig —
// se generateBackfillTip i lib/aiTips.ts. Beskyttet av samme auth-middleware
// som resten av appen (ingen egen matcher-unntak for denne ruten).
function isCategory(v: unknown): v is AiTipCategory {
  return typeof v === "string" && (AI_TIPS_CATEGORIES as readonly string[]).includes(v);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const category = body?.category;
  const date = typeof body?.date === "string" ? body.date : null;
  if (!isCategory(category) || !date) return NextResponse.json({ error: "Mangler/ugyldig category eller date" }, { status: 400 });

  const tip = await generateBackfillTip(category, date);
  if (!tip) return NextResponse.json({ error: "Generering feilet" }, { status: 500 });
  return NextResponse.json({ tip });
}
