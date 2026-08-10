import { NextRequest, NextResponse } from "next/server";
import { addReminder, getReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reminders = await getReminders();
    return NextResponse.json({ reminders });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const reminder = await addReminder(body);
    return NextResponse.json(reminder, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
