import { NextResponse } from "next/server";
import { deleteManualIncomeLine, updateManualIncomeLine } from "@/lib/incomeForecastManual";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const line = await updateManualIncomeLine(id, body);
    if (!line) return NextResponse.json({ error: "Fant ikke linjen" }, { status: 404 });
    return NextResponse.json(line);
  } catch (err) {
    // v76 (2026-09-25): var 500 uansett årsak - updateManualIncomeLine() kaster kun håndskrevne
    // valideringsfeil (manglende beskrivelse/selskap/bygg/konto), samme som addManualIncomeLine i
    // søsterruten (manual-lines/route.ts), som riktig svarer 400 på dem.
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteManualIncomeLine(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
