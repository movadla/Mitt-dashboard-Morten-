import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { del, incrWithExpiry } from "@/lib/kv";

// Egen innlogging for den delte, skrivebeskyttede Inntektsprognose-visningen (/dele/*) -
// speiler app/api/auth/route.ts sitt rate-limit-mønster, men med EGEN passord-variabel
// (DELE_PIN), EGEN cookie ("dele_auth") og EGEN rate-limit-nøkkel-navnerom, slik at et
// gjettet/lekket delingspassord aldri gir tilgang til hoved-PIN-en eller omvendt.
const MAKS_FORSOK = 5;
const VINDU_SEKUNDER = 15 * 60;

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ukjent";
  const forsokKey = `dele-auth:feilforsok:${ip}`;
  const forsok = await incrWithExpiry(forsokKey, VINDU_SEKUNDER);
  if (forsok > MAKS_FORSOK) {
    return NextResponse.json({ error: "For mange feilforsøk — prøv igjen om 15 minutter" }, { status: 429 });
  }
  if (!process.env.DELE_PIN || pin !== process.env.DELE_PIN) {
    return NextResponse.json({ error: "Feil passord" }, { status: 401 });
  }
  await del(forsokKey);
  const cookieStore = await cookies();
  cookieStore.set("dele_auth", process.env.DELE_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
