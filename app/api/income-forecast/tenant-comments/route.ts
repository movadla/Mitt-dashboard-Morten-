import { NextRequest, NextResponse } from "next/server";
import { setTenantForecastComment } from "@/lib/tenantForecastComments";

export const dynamic = "force-dynamic";

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
