import { NextRequest, NextResponse } from "next/server";
import { addRyggSessionLog, getRyggSessionLogs } from "@/lib/ryggLog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logs = await getRyggSessionLogs();
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.date || !body.week || !body.sessionNo) {
      return NextResponse.json({ error: "Mangler dato, uke eller øktnummer" }, { status: 400 });
    }
    const rpe = Number(body.rpe);
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
      return NextResponse.json({ error: "RPE må være et tall mellom 1 og 10" }, { status: 400 });
    }
    // exerciseRpe (v2, 2026-09-28): samme validering som rpe over, per øvelse - en ugyldig verdi
    // for én øvelse skal ikke kaste bort resten av økten, den øvelsen droppes bare stille.
    let exerciseRpe: Record<string, number> | undefined;
    if (body.exerciseRpe && typeof body.exerciseRpe === "object") {
      const cleaned: Record<string, number> = {};
      for (const [id, value] of Object.entries(body.exerciseRpe as Record<string, unknown>)) {
        const n = Number(value);
        if (typeof id === "string" && Number.isFinite(n) && n >= 1 && n <= 10) cleaned[id] = n;
      }
      if (Object.keys(cleaned).length > 0) exerciseRpe = cleaned;
    }
    const entry = await addRyggSessionLog({
      date: body.date,
      week: Number(body.week),
      sessionNo: Number(body.sessionNo),
      variant: body.variant === "A" || body.variant === "B" ? body.variant : undefined,
      completed: body.completed !== false,
      rpe,
      aggravated: !!body.aggravated,
      note: body.note,
      completedExerciseIds: Array.isArray(body.completedExerciseIds)
        ? body.completedExerciseIds.filter((id: unknown) => typeof id === "string")
        : undefined,
      exerciseRpe,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
