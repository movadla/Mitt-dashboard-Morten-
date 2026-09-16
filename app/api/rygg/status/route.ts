import { NextResponse } from "next/server";
import { getRyggStatus } from "@/lib/ryggWeekCycle";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getRyggStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
