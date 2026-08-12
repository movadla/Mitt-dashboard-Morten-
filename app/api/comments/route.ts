import { NextRequest, NextResponse } from "next/server";
import { addComment, getAllComments } from "@/lib/comments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const comments = await getAllComments();
    return NextResponse.json({ comments });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const comment = await addComment(body.targetType, body.targetId, body.tekst);
    return NextResponse.json({ ...comment, targetType: body.targetType, targetId: body.targetId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
