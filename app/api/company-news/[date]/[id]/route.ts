import { NextRequest, NextResponse } from "next/server";
import { deleteCompanyNewsItem } from "@/lib/companyNews";
import { verifySessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/sessionToken";

export const dynamic = "force-dynamic";

// Samme dobbel-autorisering (cookie ELLER CRON_SECRET) som app/api/company-news/route.ts
// — se kommentaren der.
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get("auth")?.value;
  if (process.env.AUTH_SECRET && (await verifySessionToken(cookie, process.env.AUTH_SECRET, SESSION_MAX_AGE_SECONDS))) return true;
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string; id: string }> },
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { date, id } = await params;
  try {
    await deleteCompanyNewsItem(date, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
