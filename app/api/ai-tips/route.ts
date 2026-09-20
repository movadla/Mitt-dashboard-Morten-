import { NextResponse } from "next/server";
import { getOrGenerateTodayTip, getArchive } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Lat generering: normalt har cronen (app/api/cron/ai-tips) allerede laget
// dagens tips før Morten åpner appen, men dette er sikkerhetsnettet hvis
// cronen skulle feile eller ikke ha rukket å kjøre ennå (samme mønster som
// Rygg-ukenes lat lukking).
export async function GET() {
  const [today, archive] = await Promise.all([getOrGenerateTodayTip(), getArchive()]);
  return NextResponse.json({
    today,
    archive: archive.filter((t) => t.date !== today?.date),
  });
}
