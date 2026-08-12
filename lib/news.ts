import "server-only";
import { getJSON, setJSON } from "./kv";

export interface NewsItem {
  title: string;
  link: string;
  description?: string;
  category?: string;
  pubDate?: string;
}

const CACHE_KEY = "cache:news:vg-forside";
const CACHE_TTL_SECONDS = 15 * 60;
const FEED_URL = "https://www.vg.no/rss/feed";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return undefined;
  const raw = match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1");
  const decoded = decodeEntities(raw);
  return decoded || undefined;
}

function parseFeed(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      description: extractTag(block, "description"),
      category: extractTag(block, "category"),
      pubDate: extractTag(block, "pubDate"),
    });
  }
  return items;
}

// VG sin RSS-feed (https://www.vg.no/rss/feed, "Siste nytt fra VG") har ingen
// strukturert video-markør (samme <enclosure type="img/jpg"> på alle saker) OG
// er IKKE en kuratert "toppsaker"-feed — det er en kronologisk firehose på
// tvers av alle kategorier (Nyheter/Sport/E24/...), der Sport sin
// minutt-for-minutt kamptikker ("Scoring for X", "1-3: X, Y") drukner ut
// faktiske toppsaker. Prøvd flere alternative VG-endepunkter (rss/feed/forsiden,
// rss/forsiden, ?section=forsiden) — alle enten 404 eller identisk innhold, så
// dette er eneste tilgjengelige kilde. Filtrert bort her ved tittelmønster
// (eneste signal RSS-en gir):
// - "Se ..." (høydepunkter/klipp), "Her ser/er ..." (bilde-/videobildetekster)
// - "Scoring for X" og "T-T: X, Y" (fotball-måltikker, ikke egne artikler)
const NOISE_TITLE_PATTERNS = [
  /^se\b/i,
  /^her (ser|er)\b/i,
  /^scoring for\b/i,
  /^\d+-\d+:/,
];

function isNoiseItem(item: NewsItem): boolean {
  return NOISE_TITLE_PATTERNS.some((p) => p.test(item.title)) || item.link.includes("/video/");
}

const TOP_N = 3;

export async function getNews(): Promise<NewsItem[]> {
  const cached = await getJSON<NewsItem[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (mitt-dashboard privat nyhetsboks)" } });
  if (!res.ok) throw new Error(`VG RSS feil: ${res.status}`);
  const xml = await res.text();
  const items = parseFeed(xml)
    .filter((item) => !isNoiseItem(item))
    .slice(0, TOP_N);

  await setJSON(CACHE_KEY, items, CACHE_TTL_SECONDS);
  return items;
}
