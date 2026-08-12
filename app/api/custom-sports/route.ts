import { NextRequest, NextResponse } from "next/server";
import { addCustomSportEvent, getCustomSportEvents } from "@/lib/customSports";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getCustomSportEvents();
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const event = await addCustomSportEvent(body);
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
