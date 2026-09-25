import { NextRequest, NextResponse } from "next/server";
import { getTenantForecastCommentsForApi, setTenantForecastComment } from "@/lib/tenantForecastComments";

export const dynamic = "force-dynamic";

// v51: hele kommentarkartet. Leietakerkommentarene flettes inn i tabell-snapshotet ved lesing, men
// LINJEkommentarene har sammensatt nøkkel ("<leietaker>||<linjenøkkel>") og hører ikke til noen rad
// i snapshotet - de må hentes separat.
// v76 (2026-09-25): brukte tidligere getTenantForecastComments()/-Authors() direkte, som returnerer
// EKTE leietakernavn i nøkkelen uansett miljø - lekket til /dele. Se getTenantForecastCommentsForApi().
export async function GET() {
  try {
    const { kommentarer, forfattere } = await getTenantForecastCommentsForApi();
    return NextResponse.json({ kommentarer, forfattere });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const navn = String(body.navn ?? "");
    const kommentar = String(body.kommentar ?? "");
    const entry = await setTenantForecastComment(navn, kommentar);
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
