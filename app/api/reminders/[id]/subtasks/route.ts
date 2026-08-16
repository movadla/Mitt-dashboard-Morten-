import { NextRequest, NextResponse } from "next/server";
import { addSubtask } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  try {
    const reminder = await addSubtask(id, body.text);
    if (!reminder) return NextResponse.json({ error: "Fant ikke påminnelsen" }, { status: 404 });
    return NextResponse.json(reminder, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
