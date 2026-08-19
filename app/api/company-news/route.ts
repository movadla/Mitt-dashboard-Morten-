import { NextRequest, NextResponse } from "next/server";
import { addCompanyNewsItems, getAllCompanyNews, type NewNewsItemInput } from "@/lib/companyNews";

export const dynamic = "force-dynamic";

// Unntatt fra PIN-middlewaren (se middleware.ts) slik at Claude kan skrive nye
// nyheter fra en arbeidsøkt (uten en innlogget nettleser-sesjon) — autoriseres
// da med CRON_SECRET i stedet for auth-cookien. Samme mønster som
// app/api/backup/route.ts. Siden middlewaren ikke lenger dekker denne ruten,
// gjøres BÅDE GET og POST-autorisering her i selve handleren.
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
    const news = await getAllCompanyNews();
    return NextResponse.json({ news });
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
    const items = body.items as NewNewsItemInput[] | undefined;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Mangler items" }, { status: 400 });
    }
    const created = await addCompanyNewsItems(items);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
