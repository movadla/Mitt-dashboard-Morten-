import { NextRequest, NextResponse } from "next/server";
import { deleteRyggSessionLog, updateRyggSessionLog } from "@/lib/ryggLog";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const updates: Parameters<typeof updateRyggSessionLog>[1] = {};
    if (body.rpe !== undefined) updates.rpe = Number(body.rpe);
    if (body.completed !== undefined) updates.completed = !!body.completed;
    if (body.aggravated !== undefined) updates.aggravated = !!body.aggravated;
    if (body.note !== undefined) updates.note = body.note;
    if (body.variant !== undefined) updates.variant = body.variant === "A" || body.variant === "B" ? body.variant : undefined;

    const entry = await updateRyggSessionLog(id, updates);
    if (!entry) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteRyggSessionLog(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
