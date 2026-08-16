import { NextResponse } from "next/server";
import { deleteSubtask, toggleSubtask } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; subtaskId: string }> },
) {
  const { id, subtaskId } = await params;
  try {
    const reminder = await toggleSubtask(id, subtaskId);
    if (!reminder) return NextResponse.json({ error: "Fant ikke punktet" }, { status: 404 });
    return NextResponse.json(reminder);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; subtaskId: string }> },
) {
  const { id, subtaskId } = await params;
  try {
    const reminder = await deleteSubtask(id, subtaskId);
    if (!reminder) return NextResponse.json({ error: "Fant ikke punktet" }, { status: 404 });
    return NextResponse.json(reminder);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
