import { NextRequest, NextResponse } from "next/server";
import { getEveningLog, upsertEveningLogEntry } from "@/lib/eveningLog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await getEveningLog();
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    if (!body?.date) throw new Error("Mangler dato");
    const entry = await upsertEveningLogEntry(body.date, body.categories ?? [], body.notes ?? "");
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
