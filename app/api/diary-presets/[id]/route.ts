import { NextRequest, NextResponse } from "next/server";
import { deleteDiaryPreset, renameDiaryPreset } from "@/lib/diaryPresets";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const preset = await renameDiaryPreset(id, body.label);
    if (!preset) return NextResponse.json({ error: "Fant ikke presetet" }, { status: 404 });
    return NextResponse.json(preset);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteDiaryPreset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
