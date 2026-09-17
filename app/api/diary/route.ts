import { NextRequest, NextResponse } from "next/server";
import { getDiaryEntries, upsertDiaryEntry } from "@/lib/diary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await getDiaryEntries();
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.date) return NextResponse.json({ error: "Mangler dato" }, { status: 400 });
    const steps = body.steps === null || body.steps === undefined ? body.steps : Number(body.steps);
    if (steps !== null && steps !== undefined && (!Number.isFinite(steps) || steps < 0)) {
      return NextResponse.json({ error: "Skritt må være et positivt tall" }, { status: 400 });
    }
    const entry = await upsertDiaryEntry(body.date, {
      people: body.people ?? [],
      places: body.places ?? [],
      notes: body.notes,
      steps,
      photoUrl: body.photoUrl,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
