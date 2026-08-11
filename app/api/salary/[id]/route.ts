import { NextResponse } from "next/server";
import { deleteSalaryEntry, updateSalaryEntry } from "@/lib/salary";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const entry = await updateSalaryEntry(id, body);
    if (!entry) return NextResponse.json({ error: "Fant ikke lønnsoppføringen" }, { status: 404 });
    return NextResponse.json(entry);
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
    await deleteSalaryEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
