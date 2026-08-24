import { NextRequest, NextResponse } from "next/server";
import { getTenantSignals, updateTenantSignal } from "@/lib/tenantSignals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const signals = await getTenantSignals();
    return NextResponse.json({ signals });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const signal = await updateTenantSignal(body.id, {
      sannsynlighetProsent: body.sannsynlighetProsent,
      notat: body.notat,
      type: body.type,
      navn: body.navn,
      bygg: body.bygg,
    });
    if (!signal) return NextResponse.json({ error: "Fant ikke signalet - må ha type+navn for å opprette nytt" }, { status: 404 });
    return NextResponse.json(signal);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
