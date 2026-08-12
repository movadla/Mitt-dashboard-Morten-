import { NextResponse } from "next/server";
import { deleteJobbEvent, updateJobbEvent, type JobbEventUpdateInput } from "@/lib/jobbEvents";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: JobbEventUpdateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Mangler oppdateringsfelt" }, { status: 400 });
  }

  try {
    const event = await updateJobbEvent(id, body);
    if (!event) return NextResponse.json({ error: "Fant ikke hendelsen" }, { status: 404 });
    return NextResponse.json(event);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteJobbEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
