import { NextRequest, NextResponse } from "next/server";
import { buildBackup } from "@/lib/backup";
import { verifySessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/sessionToken";

export const dynamic = "force-dynamic";

// Denne ruten er unntatt fra PIN-middlewaren (se middleware.ts) slik at en
// planlagt jobb (uten nettleser-cookie) også kan hente den — autoriseres da
// med CRON_SECRET i stedet for auth-cookien.
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get("auth")?.value;
  if (process.env.AUTH_SECRET && (await verifySessionToken(cookie, process.env.AUTH_SECRET, SESSION_MAX_AGE_SECONDS))) return true;
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const backup = await buildBackup();
  const filename = `mitt-dashboard-backup-${backup.exportedAt.slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
