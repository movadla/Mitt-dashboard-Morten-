import { NextResponse } from "next/server";
import { deleteWorkoutSession, endWorkoutSession } from "@/lib/workouts";

export const dynamic = "force-dynamic";

// Avslutter økten — valgfri body { notes } settes som sluttnotat på økten.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let notes: string | undefined;
  try {
    const body = await request.json();
    notes = body?.notes;
  } catch {
    notes = undefined;
  }

  try {
    const session = await endWorkoutSession(id, notes);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session);
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
    await deleteWorkoutSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
