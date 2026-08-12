import { NextRequest, NextResponse } from "next/server";
import { addNote, getNotes } from "@/lib/notes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const notes = await getNotes();
    return NextResponse.json({ notes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const note = await addNote(body);
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
