import { NextResponse } from "next/server";
import { deleteRoutine, updateRoutine, type RoutineUpdateInput } from "@/lib/routines";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: RoutineUpdateInput = await request.json();
  try {
    const routine = await updateRoutine(id, body);
    if (!routine) return NextResponse.json({ error: "Fant ikke rutinen" }, { status: 404 });
    return NextResponse.json(routine);
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
    await deleteRoutine(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
