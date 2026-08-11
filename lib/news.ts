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

export async function getNews(): Promise<NewsItem[]> {
  const cached = await getJSON<NewsItem[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (mitt-dashboard privat nyhetsboks)" } });
  if (!res.ok) throw new Error(`VG RSS feil: ${res.status}`);
  const xml = await res.text();
  const items = parseFeed(xml).slice(0, 12);

  await setJSON(CACHE_KEY, items, CACHE_TTL_SECONDS);
  return items;
}
