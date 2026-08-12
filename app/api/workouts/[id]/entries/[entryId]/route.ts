import { NextResponse } from "next/server";
import { deleteWorkoutEntry, updateWorkoutEntry, type WorkoutEntryUpdateInput } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  const body: WorkoutEntryUpdateInput = await request.json();
  try {
    const session = await updateWorkoutEntry(id, entryId, body);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  try {
    const session = await deleteWorkoutEntry(id, entryId);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
