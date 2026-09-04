import { NextRequest, NextResponse } from "next/server";
import { runChatTurn } from "@/lib/chatAgent";
import { getChatHistory } from "@/lib/chatHistory";

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

  // Hver snarveis-utløsning var tidligere ETT isolert utsagn uten noe av
  // samtalen fra før — hvis Alfred svarte med et oppfølgingsspørsmål, hadde
  // en ny utløsning av snarveien ingen anelse om hva den nettopp ble spurt
  // om, så et "svar" traff aldri sammenhengen. Deler nå historikk med
  // chat-boblen (app/api/chat, samme "privat:chat:history"-nøkkel) slik at
  // en oppfølging via talekommando faktisk fortsetter forrige utveksling —
  // samme "husker til man trykker Tøm i chat-boblen"-modell som der.
  const history = await getChatHistory();
  const messages = [...history, { role: "user" as const, content: text.trim() }];

  const result = await runChatTurn(messages, { voiceMode: true });
  // awaitingReply forteller snarveien om den skal åpne mikrofonen på nytt
  // (assistenten stilte et spørsmål) eller avslutte — det som gjør flyten til
  // en reell frem-og-tilbake-samtale i stedet for ett engangs-svar per trykk.
  // `fortsett` er samme signal som ren tekst ("ja"/"nei"): iOS Snarveier har
  // upålitelig håndtering av JSON-boolske verdier i "Hvis"-betingelser, så en
  // tekstsammenligning er langt enklere å sette opp der.
  return NextResponse.json({
    reply: result.text,
    changed: result.changed,
    awaitingReply: result.awaitingReply,
    fortsett: result.awaitingReply ? "ja" : "nei",
  });
}
