import { NextResponse } from "next/server";
import { getWorkoutSessions, startWorkoutSession } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await getWorkoutSessions();
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Starter en ny økt — eller returnerer den pågående hvis en allerede er i gang.
export async function POST() {
  try {
    const session = await startWorkoutSession();
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
