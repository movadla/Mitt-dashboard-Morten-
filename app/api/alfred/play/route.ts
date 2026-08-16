import { NextRequest, NextResponse } from "next/server";
import { addPlayIdea, getPlayIdeas } from "@/lib/alfred";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ideas = await getPlayIdeas();
    return NextResponse.json({ ideas });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const idea = await addPlayIdea(body.label);
    return NextResponse.json(idea, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
