import { getSportEvents, getSportsFetchedAt } from "@/lib/sports";

export async function GET() {
  const events = await getSportEvents();
  return Response.json({ events, fetchedAt: getSportsFetchedAt() });
}
