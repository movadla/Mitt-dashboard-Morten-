import { NextRequest, NextResponse } from "next/server";
import { deleteSuggestion } from "@/lib/jobbSuggestions";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = request.cookies.get("auth")?.value;
  if (auth !== process.env.AUTH_SECRET) {
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
