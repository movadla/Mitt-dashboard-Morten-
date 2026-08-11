import { NextRequest, NextResponse } from "next/server";
import { buildBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

// Denne ruten er unntatt fra PIN-middlewaren (se middleware.ts) slik at en
// planlagt jobb (uten nettleser-cookie) også kan hente den — autoriseres da
// med CRON_SECRET i stedet for auth-cookien.
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
  const backup = await buildBackup();
  const filename = `mitt-dashboard-backup-${backup.exportedAt.slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
