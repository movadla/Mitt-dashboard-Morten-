import { NextResponse } from "next/server";
import { deleteEveningLogEntry } from "@/lib/eveningLog";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  try {
    await deleteEveningLogEntry(date);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
