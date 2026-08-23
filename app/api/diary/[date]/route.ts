import { NextResponse } from "next/server";
import { deleteDiaryEntry } from "@/lib/diary";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  try {
    await deleteDiaryEntry(date);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
