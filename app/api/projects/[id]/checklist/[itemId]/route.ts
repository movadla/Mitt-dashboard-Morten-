import { NextResponse } from "next/server";
import { deleteChecklistItem, toggleChecklistItem } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  try {
    const project = await toggleChecklistItem(id, itemId);
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
