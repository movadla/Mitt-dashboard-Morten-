import { NextResponse } from "next/server";
import { deleteComment, setCommentRelevance, type CommentTargetType } from "@/lib/comments";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ targetType: string; targetId: string; commentId: string }> },
) {
  const { targetType, targetId, commentId } = await params;
  try {
    await deleteComment(targetType as CommentTargetType, targetId, commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ targetType: string; targetId: string; commentId: string }> },
) {
  const { targetType, targetId, commentId } = await params;
  const body = await request.json();
  try {
    await setCommentRelevance(targetType as CommentTargetType, targetId, commentId, Boolean(body.ikkeRelevant));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
