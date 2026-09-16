import { NextResponse } from "next/server";
import { deleteRyggDailyLog } from "@/lib/ryggLog";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  try {
    await deleteRyggDailyLog(date);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
