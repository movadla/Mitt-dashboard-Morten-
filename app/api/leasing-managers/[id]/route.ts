import { NextResponse } from "next/server";
import { deleteLeasingManager, updateLeasingManager } from "@/lib/leasingManagers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const manager = await updateLeasingManager(id, body);
    if (!manager) return NextResponse.json({ error: "Fant ikke utleieansvarlig" }, { status: 404 });
    return NextResponse.json(manager);
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
    await deleteLeasingManager(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
