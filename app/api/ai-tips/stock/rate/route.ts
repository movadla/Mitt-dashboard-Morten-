import { NextRequest, NextResponse } from "next/server";
import { submitStockFeedback, type AiTipFeedbackInput } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Speiler /api/ai-tips/rate, men peker på submitStockFeedback — som skriver
// til Lagers EGEN profil (STOCK_PROFILE_HASH_KEY i lib/aiTips.ts), ikke
// Dagens' profil. `id` er lager-tipsets UUID (samme verdi som tip.date).
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const priorKnowledge = Number(body?.priorKnowledge);
  const understanding = Number(body?.understanding);
  const interest = Number(body?.interest);
  const formatFit = Number(body?.formatFit);
  if (
    !id ||
    !Number.isFinite(priorKnowledge) ||
    !Number.isFinite(understanding) ||
    !Number.isFinite(interest) ||
    !Number.isFinite(formatFit)
  ) {
    return NextResponse.json({ error: "Mangler id/vurdering" }, { status: 400 });
  }

  const input: AiTipFeedbackInput = {
    priorKnowledge,
    understanding,
    interest,
    formatFit,
    difficultTopics: toStringArray(body?.difficultTopics),
    difficultNote: typeof body?.difficultNote === "string" ? body.difficultNote : undefined,
    wantMoreTopics: toStringArray(body?.wantMoreTopics),
    improvementNote: typeof body?.improvementNote === "string" ? body.improvementNote : undefined,
  };

  const tip = await submitStockFeedback(id, input);
  if (!tip) return NextResponse.json({ error: "Fant ikke tipset" }, { status: 404 });
  return NextResponse.json({ tip });
}
