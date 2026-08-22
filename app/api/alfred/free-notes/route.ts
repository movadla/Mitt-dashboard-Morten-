import { NextRequest, NextResponse } from "next/server";
import { addAlfredFreeNote, getAlfredFreeNotes } from "@/lib/alfred";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const notes = await getAlfredFreeNotes();
    return NextResponse.json({ notes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const note = await addAlfredFreeNote(body.text);
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
