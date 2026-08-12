import { NextResponse } from "next/server";
import { getExercises } from "@/lib/exercises";
import { getWorkoutSessions } from "@/lib/workouts";

export const dynamic = "force-dynamic";

// Laster ned all treningsdata (øvelseskatalog + alle økter) som én JSON-fil —
// tenkt som et fullstendig, tapsfritt grunnlag for videre bruk/analyse et annet sted.
export async function GET() {
  try {
    const [exercises, sessions] = await Promise.all([getExercises(), getWorkoutSessions()]);
    const data = { exportedAt: new Date().toISOString(), exercises, sessions };
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="trening-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
