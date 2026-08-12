import { NextRequest, NextResponse } from "next/server";
import { addManualIncomeLine, getManualIncomeLines } from "@/lib/incomeForecastManual";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manualLines = await getManualIncomeLines();
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
