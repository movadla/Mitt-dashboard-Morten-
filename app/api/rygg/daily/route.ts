import { NextRequest, NextResponse } from "next/server";
import { getRyggDailyLogs, upsertRyggDailyLog } from "@/lib/ryggLog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logs = await getRyggDailyLogs();
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.date) return NextResponse.json({ error: "Mangler dato" }, { status: 400 });
    const pain = Number(body.pain);
    if (!Number.isFinite(pain) || pain < 0 || pain > 10) {
      return NextResponse.json({ error: "Smerte må være et tall mellom 0 og 10" }, { status: 400 });
    }
    const entry = await upsertRyggDailyLog(body.date, {
      pain,
      radiating: !!body.radiating,
      walked: !!body.walked,
      note: body.note,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
