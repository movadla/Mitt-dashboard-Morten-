import { NextRequest, NextResponse } from "next/server";
import { runChatTurn } from "@/lib/chatAgent";

export const dynamic = "force-dynamic";

// Denne ruten er unntatt fra PIN-middlewaren (se middleware.ts) slik at en
// iOS-snarvei (uten nettleser-cookie) også kan kalle den — autoriseres da
// med VOICE_SECRET i stedet for auth-cookien. Egen hemmelighet fremfor
// gjenbruk av CRON_SECRET: ulik tillitsgrense (én telefon-snarvei vs.
// serverjobber), bør kunne roteres uavhengig av hverandre.
function isAuthorized(request: NextRequest): boolean {
  const cookie = request.cookies.get("auth")?.value;
  if (cookie && process.env.AUTH_SECRET && cookie === process.env.AUTH_SECRET) return true;
  const authHeader = request.headers.get("authorization");
  if (process.env.VOICE_SECRET && authHeader === `Bearer ${process.env.VOICE_SECRET}`) return true;
  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY er ikke satt" }, { status: 500 });
  }

  const { text } = await request.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Mangler tekst" }, { status: 400 });
  }

  const result = await runChatTurn([{ role: "user", content: text.trim() }], { voiceMode: true });
  return NextResponse.json({ reply: result.text, changed: result.changed });
}
