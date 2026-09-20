import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateTodayTip } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Samme autorisering som de andre cron-rutene — Vercel legger selv på
// "Authorization: Bearer <CRON_SECRET>" på cron-kall.
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const tip = await getOrGenerateTodayTip();
  return NextResponse.json({ ok: !!tip, generated: !!tip });
}
