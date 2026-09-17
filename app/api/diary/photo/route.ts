import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const dynamic = "force-dynamic";

// Maks størrelse SERVEREN godtar. Klienten skalerer uansett ned til ~1600px
// før opplasting (se DiarySection), så dette er bare et sikkerhetsnett mot en
// utilsiktet råfil rett fra kameraet.
const MAX_BYTES = 6 * 1024 * 1024;

// Bilder ligger i Vercel Blob, ikke i Redis: Redis-instansen er liten (MB-
// skala, brukt til all annen tekstdata i appen), mens ett telefonbilde alene
// er flere MB. Blob har ingen praktisk grense her — ett bilde per dag i ti år
// er fortsatt godt innenfor gratis-nivået etter nedskaleringen klienten gjør.
export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Bildelagring er ikke satt opp ennå (mangler BLOB_READ_WRITE_TOKEN)." },
      { status: 501 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const date = form.get("date");
    if (!(file instanceof File)) return NextResponse.json({ error: "Mangler fil" }, { status: 400 });
    if (typeof date !== "string" || !date) return NextResponse.json({ error: "Mangler dato" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Filen er ikke et bilde" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Bildet er for stort" }, { status: 413 });

    // addRandomSuffix slik at et nytt bilde samme dag ikke overskriver det
    // gamle i en cache som fortsatt peker på samme URL.
    const blob = await put(`dagbok/${date}.jpg`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
