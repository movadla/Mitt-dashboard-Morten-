import { NextResponse } from "next/server";
import { deleteProcedureNote, updateProcedureNote } from "@/lib/procedureNotes";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const note = await updateProcedureNote(id, body);
    if (!note) return NextResponse.json({ error: "Fant ikke notatet" }, { status: 404 });
    return NextResponse.json(note);
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
    await deleteProcedureNote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
