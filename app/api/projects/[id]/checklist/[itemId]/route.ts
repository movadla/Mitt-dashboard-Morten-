import { NextResponse } from "next/server";
import { deleteChecklistItem, setChecklistItemNote, toggleChecklistItem } from "@/lib/projects";

export const dynamic = "force-dynamic";

// PATCH uten body = huk punktet av/på (uendret oppførsel). PATCH MED
// { notes } = sett notatet på punktet i stedet — samme rute, siden begge er
// "endre dette ene punktet".
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  try {
    let notes: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.notes === "string") notes = body.notes;
    } catch {
      // Ingen/ugyldig body — da er dette et vanlig avhukings-kall.
    }
    const project = notes !== undefined
      ? await setChecklistItemNote(id, itemId, notes)
      : await toggleChecklistItem(id, itemId);
    if (!project) return NextResponse.json({ error: "Fant ikke prosjektet" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  try {
    const project = await deleteChecklistItem(id, itemId);
    if (!project) return NextResponse.json({ error: "Fant ikke prosjektet" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
