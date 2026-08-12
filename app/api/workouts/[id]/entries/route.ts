import { NextRequest, NextResponse } from "next/server";
import { addWorkoutEntry } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  try {
    const session = await addWorkoutEntry(id, body);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
