import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { del, incrWithExpiry } from "@/lib/kv";

// Rate-limiting mot brute-force - appen nås fra åpent internett via Cloudflare-tunnelen, og en
// kort numerisk PIN uten dette kan i prinsippet gjettes frem. Telleren økes for HVERT forsøk
// (riktig eller feil PIN) FØR selve PIN-sjekken, slik at et riktig gjett midt i en brute-force-
// burst ikke slipper unna låsen - kun et vellykket innlogg NEDENFOR terskelen nullstiller den.
const MAKS_FORSOK = 5;
const VINDU_SEKUNDER = 15 * 60;

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ukjent";
  const forsokKey = `auth:feilforsok:${ip}`;
  const forsok = await incrWithExpiry(forsokKey, VINDU_SEKUNDER);
  if (forsok > MAKS_FORSOK) {
    return NextResponse.json({ error: "For mange feilforsøk — prøv igjen om 15 minutter" }, { status: 429 });
  }
  if (pin !== process.env.AUTH_PIN) {
    return NextResponse.json({ error: "Feil PIN" }, { status: 401 });
  }
  await del(forsokKey);
  const cookieStore = await cookies();
  cookieStore.set("auth", process.env.AUTH_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
