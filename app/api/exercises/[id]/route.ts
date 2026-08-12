import { NextResponse } from "next/server";
import { deleteExercise, updateExercise, type ExerciseUpdateInput } from "@/lib/exercises";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: ExerciseUpdateInput = await request.json();
  try {
    const exercise = await updateExercise(id, body);
    if (!exercise) return NextResponse.json({ error: "Fant ikke øvelsen" }, { status: 404 });
    return NextResponse.json(exercise);
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
    await deleteExercise(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
