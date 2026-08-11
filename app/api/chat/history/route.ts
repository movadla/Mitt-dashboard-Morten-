import { NextResponse } from "next/server";
import { clearChatHistory, getChatHistory } from "@/lib/chatHistory";

export const dynamic = "force-dynamic";

export async function GET() {
  const messages = await getChatHistory();
  return NextResponse.json({ messages });
}

export async function DELETE() {
  await clearChatHistory();
  return NextResponse.json({ ok: true });
}
