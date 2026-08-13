import { NextResponse } from "next/server";
import { deleteSet, updateSet, type SetUpdateInput } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string; setId: string }> },
) {
  const { id, entryId, setId } = await params;
  const body: SetUpdateInput = await request.json();
  try {
    const session = await updateSet(id, entryId, setId, body);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string; setId: string }> },
) {
  const { id, entryId, setId } = await params;
  try {
    const session = await deleteSet(id, entryId, setId);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
