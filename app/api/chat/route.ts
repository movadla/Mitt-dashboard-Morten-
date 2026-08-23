import { NextRequest, NextResponse } from "next/server";
import { runChatTurn } from "@/lib/chatAgent";

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
