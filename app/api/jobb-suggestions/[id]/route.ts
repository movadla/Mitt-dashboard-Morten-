import { NextRequest, NextResponse } from "next/server";
import { deleteSuggestion } from "@/lib/jobbSuggestions";
import { verifySessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/sessionToken";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = request.cookies.get("auth")?.value;
  if (!process.env.AUTH_SECRET || !(await verifySessionToken(auth, process.env.AUTH_SECRET, SESSION_MAX_AGE_SECONDS))) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteSuggestion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
