import { NextRequest, NextResponse } from "next/server";
import { addSuggestions, getSuggestions, type NewSuggestionInput } from "@/lib/jobbSuggestions";

export const dynamic = "force-dynamic";

// Unntatt fra PIN-middlewaren (se middleware.ts) slik at Claude kan legge inn
// forslag fra en research-økt uten en innlogget nettleser-sesjon — autoriseres
// da med CRON_SECRET i stedet for auth-cookien. Samme mønster som
// app/api/company-news/route.ts.
function isAuthorized(request: NextRequest): boolean {
  const cookie = request.cookies.get("auth")?.value;
  if (cookie && process.env.AUTH_SECRET && cookie === process.env.AUTH_SECRET) return true;
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  try {
    const suggestions = await getSuggestions();
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const items = body.items as NewSuggestionInput[] | undefined;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Mangler items" }, { status: 400 });
    }
    const created = await addSuggestions(items);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
