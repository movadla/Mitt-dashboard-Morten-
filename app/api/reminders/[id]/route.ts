import { NextResponse } from "next/server";
import { deleteReminder, toggleReminder } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const reminder = await toggleReminder(id);
    if (!reminder) return NextResponse.json({ error: "Fant ikke påminnelsen" }, { status: 404 });
    return NextResponse.json(reminder);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteReminder(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
