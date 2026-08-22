import { NextRequest, NextResponse } from "next/server";
import { addFplNote, getFplNotes } from "@/lib/fplNotes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const notes = await getFplNotes();
    return NextResponse.json({ notes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const note = await addFplNote(body.text);
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
