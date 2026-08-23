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
    const entry = await upsertDiaryEntry(body.date, {
      morning: body.morning ?? [],
      afternoon: body.afternoon ?? [],
      evening: body.evening ?? [],
      people: body.people ?? [],
      places: body.places ?? [],
      notes: body.notes,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
