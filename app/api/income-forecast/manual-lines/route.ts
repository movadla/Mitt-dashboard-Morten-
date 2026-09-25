import { NextRequest, NextResponse } from "next/server";
import { addManualIncomeLine, getManualIncomeLinesForApi } from "@/lib/incomeForecastManual";

export const dynamic = "force-dynamic";

// v76 (2026-09-25): brukte tidligere getManualIncomeLines() direkte - ekte selskapsnavn uansett
// miljø, lekket til /dele. Se getManualIncomeLinesForApi().
export async function GET() {
  try {
    const manualLines = await getManualIncomeLinesForApi();
    return NextResponse.json({ manualLines });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const line = await addManualIncomeLine(body);
    return NextResponse.json(line, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
