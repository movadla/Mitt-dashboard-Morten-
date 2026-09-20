import { NextResponse } from "next/server";
import { getTodayTipStatus } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Kun lesing, ALDRI generering herfra — dette kalles fra nav-badgen ved hvert
// panel-mount, og skal ikke kunne trigge et Claude-kall bare fordi Morten
// bytter fane. Genereringen skjer i cronen (eller lat i /api/ai-tips sitt GET,
// den faktiske seksjonen), ikke her.
export async function GET() {
  const status = await getTodayTipStatus();
  return NextResponse.json(status);
}
