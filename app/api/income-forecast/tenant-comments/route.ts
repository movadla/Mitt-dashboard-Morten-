import { NextRequest, NextResponse } from "next/server";
import { getTenantForecastCommentAuthors, getTenantForecastComments, setTenantForecastComment } from "@/lib/tenantForecastComments";

export const dynamic = "force-dynamic";

// v51: hele kommentarkartet. Leietakerkommentarene flettes inn i tabell-snapshotet ved lesing, men
// LINJEkommentarene har sammensatt nøkkel ("<leietaker>||<linjenøkkel>") og hører ikke til noen rad
// i snapshotet - de må hentes separat.
export async function GET() {
  try {
    const [kommentarer, forfattere] = await Promise.all([getTenantForecastComments(), getTenantForecastCommentAuthors()]);
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
