import { NextRequest, NextResponse } from "next/server";
import { getHistory, recordHistoryPoint } from "@/lib/incomeForecastHistory";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const punkter = await getHistory();
    return NextResponse.json({ punkter });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Kalles fra klienten (IncomeForecastSection.tsx) hver gang noen faktisk ser på siden - se
// lib/incomeForecastHistory.ts for hvorfor dette er "pr. besøksdag", ikke en cron-jobb.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const dato = String(body.dato ?? "");
    const kjerneTotal = Number(body.kjerneTotal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato) || !Number.isFinite(kjerneTotal)) {
      return NextResponse.json({ error: "Ugyldig dato/kjerneTotal" }, { status: 400 });
    }
    const punkter = await recordHistoryPoint({ dato, kjerneTotal });
    return NextResponse.json({ punkter });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
