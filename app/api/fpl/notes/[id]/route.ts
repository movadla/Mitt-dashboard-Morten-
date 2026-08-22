import { NextRequest, NextResponse } from "next/server";
import { deleteFplNote, editFplNote } from "@/lib/fplNotes";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const note = await editFplNote(id, body.text);
    if (!note) return NextResponse.json({ error: "Fant ikke notatet" }, { status: 404 });
    return NextResponse.json(note);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteFplNote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
