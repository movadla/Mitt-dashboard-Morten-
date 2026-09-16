import { NextResponse } from "next/server";
import { getRyggWeekStates } from "@/lib/ryggLog";
import { closeDueWeeksIfNeeded } from "@/lib/ryggWeekCycle";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { meta } = await closeDueWeeksIfNeeded();
    const weeks = await getRyggWeekStates();
    return NextResponse.json({ weeks, meta });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
