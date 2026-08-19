// VM 2026 (FIFA World Cup) — full kampskjema fra ESPN.
// Henter hele turneringen via 3 fase-intervaller (ESPN kapper på 100 treff per kall).
import { localDateString } from "@/lib/payday";

const UA   = { headers: { "User-Agent": "mitt-private-dashboard/1.0" } };
const ESPN = "http://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

// Dato-intervaller som dekker hele VM 2026 (gruppespill → finale), holdt under 100 treff hver.
const RANGES = ["20260611-20260628", "20260628-20260710", "20260710-20260720"];

let cache: { data: unknown; expires: number } | null = null;

interface SportEvent {
  id: string;
  category: string;
  name: string;
  venue?: string;
  date: string;   // YYYY-MM-DD, norsk lokaltid
  time?: string;  // HH:MM, norsk lokaltid
  competition: string;
}

function toNorway(ts: number): { date: string; time: string } {
  const dt = new Date(ts);
  const month = dt.getUTCMonth() + 1;
  const offset = month >= 4 && month <= 10 ? 2 : 1; // CEST/CET
  const local = new Date(dt.getTime() + offset * 3_600_000);
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

function matchName(raw: string): string {
  const parts = raw.split(/ at /i);
  if (parts.length === 2) return `${parts[1].trim()} – ${parts[0].trim()}`; // "Away at Home" → "Home – Away"
  return raw.replace(/ vs\.? /i, " – ");
}

export async function GET() {
  if (cache && cache.expires > Date.now()) return Response.json(cache.data);

  const boards = await Promise.allSettled(
    RANGES.map(r =>
      fetch(`${ESPN}/scoreboard?dates=${r}`, UA).then(res => (res.ok ? res.json() : null)).catch(() => null)
    )
  );

  const byId = new Map<string, SportEvent>();
  for (const b of boards) {
    if (b.status !== "fulfilled" || !b.value) continue;
    for (const ev of ((b.value.events ?? []) as EspnEvent[])) {
      const comp = ev.competitions?.[0];
      const { date, time } = toNorway(new Date(ev.date).getTime());
      byId.set(ev.id, {
        id:          `wc-${ev.id}`,
        category:    "worldcup",
        name:        matchName(ev.name),
        venue:       comp?.venue?.displayName ?? comp?.venue?.address?.city,
        date,
        time,
        competition: "VM 2026",
      });
    }
  }

  const today = localDateString();
  const events = [...byId.values()]
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  const data = { events, fetchedAt: Date.now() };
  cache = { data, expires: Date.now() + 6 * 60 * 60 * 1000 };
  return Response.json(data);
}

interface EspnEvent {
  id: string; name: string; date: string;
  competitions?: Array<{
    venue?: { displayName?: string; address?: { city?: string } };
  }>;
}
