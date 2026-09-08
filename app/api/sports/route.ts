import { getSportEvents, getSportsFetchedAt } from "@/lib/sports";
import { invalidateSportsCache } from "@/lib/sportsCache";

// ?refresh=1 tømmer Redis-cachen før hentingen (2026-09-08). Cachen lever i 3
// timer, så uten dette ble en retting i kildene — eller en turnering som først
// nå begynner å svare — usynlig i opptil tre timer, uten noen måte å tvinge den
// frem på annet enn å vente. Kun tillatt på GET fordi den ikke endrer data:
// neste henting bygger cachen opp igjen fra kildene.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("refresh") === "1") {
    await invalidateSportsCache();
  }
  const events = await getSportEvents();
  return Response.json({ events, fetchedAt: getSportsFetchedAt() });
}
