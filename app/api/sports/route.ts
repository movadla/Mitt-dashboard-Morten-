import { getSportEvents } from "@/lib/sports";

export async function GET() {
  const events = await getSportEvents();
  return Response.json({ events });
}
