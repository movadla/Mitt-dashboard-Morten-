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

// iOS Snarveier har ingen måte å vise en HTTP-statuskode på — den eneste
// tilbakemeldingen brukeren får er «Hent ordbokverdi mislyktes. Snarveier kunne
// ikke konvertere fra Tekst til Ordbok», uansett hva som gikk galt. Derfor MÅ
// hvert eneste svar herfra være JSON med et `reply`-felt: da leser snarveien
// opp hva som er feil i stedet for å stoppe med en melding som ikke sier noe.
//
// Uten GET-håndtereren under svarte Next med 405 og en HELT TOM kropp, som er
// nøyaktig det som utløser den meldingen. Sender snarveien GET (standarden når
// metode og kropp ikke er satt eksplisitt i «Hent innhold på»), sier den nå fra
// hva som mangler. (2026-09-13)
function voiceError(message: string, status: number) {
  return NextResponse.json({ reply: message, error: message, changed: false, awaitingReply: false, fortsett: "nei" }, { status });
}

export async function GET() {
  return voiceError(
    "Talekommandoen må sendes som POST med en JSON-kropp, ikke GET. Sjekk at snarveien har Metode satt til POST og Forespørselskropp til JSON med feltet text.",
    405,
  );
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return voiceError("Ikke autorisert. Sjekk at snarveien sender Authorization-headeren med riktig hemmelighet.", 401);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return voiceError("ANTHROPIC_API_KEY er ikke satt på serveren.", 500);
  }

  // request.json() KASTER på tom eller ugyldig kropp, og et ubehandlet kast gir
  // et 500-svar fra Vercel i ren tekst — altså samme blindvei som over.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return voiceError("Forespørselen hadde ingen gyldig JSON-kropp. Snarveien må sende {\"text\": \"...\"}.", 400);
  }
  const { text } = (body ?? {}) as { text?: unknown };
  if (typeof text !== "string" || !text.trim()) {
    return voiceError("Fant ingen tekst i forespørselen. Feltet text må være med og ikke tomt.", 400);
  }

  // Hver snarveis-utløsning var tidligere ETT isolert utsagn uten noe av
  // samtalen fra før — hvis Alfred svarte med et oppfølgingsspørsmål, hadde
  // en ny utløsning av snarveien ingen anelse om hva den nettopp ble spurt
  // om, så et "svar" traff aldri sammenhengen. Deler nå historikk med
  // chat-boblen (app/api/chat, samme "privat:chat:history"-nøkkel) slik at
  // en oppfølging via talekommando faktisk fortsetter forrige utveksling —
  // samme "husker til man trykker Tøm i chat-boblen"-modell som der.
  // Kaster runChatTurn — f.eks. fordi et verktøykall feiler eller Anthropic
  // svarer med en feil — ga Vercel et 500-svar i ren tekst, og snarveien stoppet
  // med den samme intetsigende konverteringsfeilen. Nå leses feilen opp i
  // stedet, så det går an å se HVA som gikk galt uten å åpne loggene.
  let result: Awaited<ReturnType<typeof runChatTurn>>;
  try {
    const history = await getChatHistory();
    const messages = [...history, { role: "user" as const, content: text.trim() }];
    result = await runChatTurn(messages, { voiceMode: true });
  } catch (e) {
    const detalj = e instanceof Error ? e.message : String(e);
    console.error("voice-command feilet:", e);
    return voiceError(`Noe gikk galt under behandlingen: ${detalj}`, 500);
  }
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
