import { NextRequest, NextResponse } from "next/server";
import { deleteCompanyNewsItem } from "@/lib/companyNews";

export const dynamic = "force-dynamic";

// Samme dobbel-autorisering (cookie ELLER CRON_SECRET) som app/api/company-news/route.ts
// — se kommentaren der.
function isAuthorized(request: NextRequest): boolean {
  const cookie = request.cookies.get("auth")?.value;
  if (cookie && process.env.AUTH_SECRET && cookie === process.env.AUTH_SECRET) return true;
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string; id: string }> },
) {
  if (!isAuthorized(request)) {
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
