import { NextRequest, NextResponse } from "next/server";
import { addPrivatEvent, getPrivatEvents } from "@/lib/privatCalendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getPrivatEvents();
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const event = await addPrivatEvent(body);
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
