import { NextResponse } from "next/server";
import { deleteReminder, toggleReminder, updateReminder, type ReminderUpdateInput } from "@/lib/reminders";

export const dynamic = "force-dynamic";

// Uten body (som fra avhukingsknappen) -> huk av/på. Med body -> rediger felt.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: ReminderUpdateInput | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    const reminder =
      body && Object.keys(body).length > 0 ? await updateReminder(id, body) : await toggleReminder(id);
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
