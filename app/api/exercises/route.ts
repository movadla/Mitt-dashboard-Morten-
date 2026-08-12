import { NextRequest, NextResponse } from "next/server";
import { addExercise, getExercises } from "@/lib/exercises";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const exercises = await getExercises();
    return NextResponse.json({ exercises });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const exercise = await addExercise(body);
    return NextResponse.json(exercise, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
