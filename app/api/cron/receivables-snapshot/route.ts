import { NextRequest, NextResponse } from "next/server";
import { createAndSaveTodaysSnapshot } from "@/lib/receivablesSnapshots";

export const dynamic = "force-dynamic";

// Kalt av Vercel Cron (se vercel.json) — ingen nettleser-cookie tilgjengelig her,
// så ruten er unntatt fra PIN-middlewaren (se middleware.ts) og autoriseres i
// stedet med CRON_SECRET, samme mønster som app/api/backup/route.ts. Vercel
// legger automatisk på "Authorization: Bearer <CRON_SECRET>" når den kaller
// en cron-rute og CRON_SECRET er satt som miljøvariabel på prosjektet.
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const snapshot = await createAndSaveTodaysSnapshot();
  return NextResponse.json({ ok: true, dato: snapshot.dato, antallLeietakere: snapshot.rader.length });
}
