import { NextRequest, NextResponse } from "next/server";
import { submitFeedback, type AiTipFeedbackInput } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : null;
  const priorKnowledge = Number(body?.priorKnowledge);
  const understanding = Number(body?.understanding);
  if (!date || !Number.isFinite(priorKnowledge) || !Number.isFinite(understanding)) {
    return NextResponse.json({ error: "Mangler dato/vurdering" }, { status: 400 });
  }

  const input: AiTipFeedbackInput = {
    priorKnowledge,
    understanding,
    difficultTopics: toStringArray(body?.difficultTopics),
    difficultNote: typeof body?.difficultNote === "string" ? body.difficultNote : undefined,
    wantMoreTopics: toStringArray(body?.wantMoreTopics),
  };

  const tip = await submitFeedback(date, input);
  if (!tip) return NextResponse.json({ error: "Fant ikke tipset" }, { status: 404 });
  return NextResponse.json({ tip });
}
