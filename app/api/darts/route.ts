import { getDartsFetchedAt, getDartsStats } from "@/lib/darts";

export async function GET() {
  const stats = await getDartsStats();
  return Response.json({ stats, fetchedAt: getDartsFetchedAt() });
}
