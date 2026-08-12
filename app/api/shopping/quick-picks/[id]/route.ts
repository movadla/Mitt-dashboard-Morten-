import { NextResponse } from "next/server";
import { deleteQuickPick, updateQuickPick, type QuickPickUpdateInput } from "@/lib/shoppingQuickPicks";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: QuickPickUpdateInput = await request.json();
  try {
    const quickPick = await updateQuickPick(id, body);
    if (!quickPick) return NextResponse.json({ error: "Fant ikke hurtigvalget" }, { status: 404 });
    return NextResponse.json(quickPick);
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
    await deleteQuickPick(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
