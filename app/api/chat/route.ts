import { NextRequest, NextResponse } from "next/server";
import { runChatTurn } from "@/lib/chatAgent";

// Samme agent og samme tidsproblem som i app/api/voice-command — se begrunnelsen
// der. Chat-boblen rammes likt: alt som krever et verktøykall trenger minst to
// rundturer mot Anthropic, og det rakk ikke standardgrensen. (2026-09-13)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY er ikke satt" },
      { status: 500 },
    );
  }

  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Mangler meldinger" }, { status: 400 });
  }

  const result = await runChatTurn(messages);
  return NextResponse.json(result);
}
