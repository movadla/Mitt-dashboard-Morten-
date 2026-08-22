import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getJSON, setJSON } from "./kv";
import { recordUsage } from "./aiUsage";

export interface NewsItem {
  title: string;
  link: string;
  description?: string;
  category?: string;
  pubDate?: string;
  // Claude-tolket tittel/sammendrag av selve artikkelen — se summarizeArticle.
  // Usatt hvis AI-kallet feilet eller ANTHROPIC_API_KEY ikke er satt; UI-en
  // faller da tilbake til title/description.
  aiTitle?: string;
  summaryBullets?: string[];
}

const CACHE_KEY = "cache:news:vg-forside";
const CACHE_TTL_SECONDS = 15 * 60;
const FEED_URL = "https://www.vg.no/rss/feed";
const MODEL = "claude-haiku-4-5";

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
// Bredere vindu enn TOP_N slik at vi kan PRIORITERE "Nyheter"-kategorien i
// stedet for bare å ta de kronologisk første — VGs faktiske forside-toppsaker
// er nesten alltid "Nyheter", mens E24/Sport ofte trenger seg forbi dem rent
// kronologisk (verifisert manuelt mot vg.no sin forside 22.08.2026).
const RAW_WINDOW = 20;

// Prioriterer "Nyheter"-kategorien først (i sin opprinnelige, kronologiske
// rekkefølge), deretter andre kategorier — hele vinduet, IKKE kuttet til
// TOP_N ennå, siden getNews under må kunne hoppe over VGTV-videosaker (som
// ikke har tekst å tolke) og likevel fylle opp TOP_N reelle saker.
function prioritizeStories(items: NewsItem[]): NewsItem[] {
  const nyheter = items.filter((i) => i.category === "Nyheter");
  const rest = items.filter((i) => i.category !== "Nyheter");
  return [...nyheter, ...rest];
}

// Strip HTML til ren tekst — samme regex-baserte tilnærming som resten av
// filen (ingen HTML-parser-bibliotek i prosjektet). Grovt, men holder for å
// gi Claude nok kontekst til å tolke artikkelen; navigasjons-/reklametekst
// som slipper gjennom instrueres modellen selv til å ignorere.
function stripHtmlToText(html: string): string {
  const withoutBoilerplate = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = decodeEntities(withoutBoilerplate.replace(/<[^>]+>/g, " "));
  return text.replace(/\s+/g, " ").trim().slice(0, 6000);
}

interface AiNewsResult {
  title: string;
  bullets: string[];
}

interface ArticlePage {
  text: string;
  // VGTV-videosaker ("i/<id>/..."-lenker kan pekere til rene videoinnslag,
  // ikke tekstartikler) rendres klientside og har INGEN artikkeltekst i
  // rå HTML-en (kun "You need to enable JavaScript to run this app.") —
  // verifisert manuelt 22.08.2026. Disse må hoppes over og erstattes med
  // neste kandidat, ikke bare falle tilbake til VGs originaltittel, siden
  // de sjelden er reelle toppsaker i utgangspunktet.
  isVideo: boolean;
}

// Henter selve artikkelsiden. Returnerer null ved fetch-feil.
async function fetchArticlePage(link: string): Promise<ArticlePage | null> {
  try {
    const res = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0 (mitt-dashboard privat nyhetsboks)" } });
    if (!res.ok) return null;
    const html = await res.text();
    const isVideo = /property="og:type"\s+content="video/i.test(html) || /property="og:site_name"\s+content="VGTV"/i.test(html);
    return { text: stripHtmlToText(html), isVideo };
  } catch {
    return null;
  }
}

// Ber Claude Haiku om en tolket tittel (ikke VGs egen) + punktvis
// sammendrag av allerede hentet artikkeltekst. Returnerer null ved ethvert
// feilsteg (manglende API-nøkkel, uparsérbart svar) — kalleren faller da
// tilbake til dagens oppførsel for den enkelte saken, aldri en hard feil.
async function summarizeText(item: NewsItem, text: string): Promise<AiNewsResult | null> {
  if (!process.env.ANTHROPIC_API_KEY || !text) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        'Du hjelper til med å tolke norske nyhetsartikler til en kortfattet, nøytral tittel og et punktvis sammendrag. Svar KUN med gyldig JSON på formen {"title": string, "bullets": string[]} — ingen annen tekst før eller etter.',
      messages: [
        {
          role: "user",
          content: `Artikkelens originaltittel (VGs egen, ikke nødvendigvis den beste beskrivelsen): "${item.title}"

Artikkeltekst (kan inneholde noe navigasjons-/reklametekst fra siden rundt selve artikkelen — ignorer det som klart ikke er brødteksten):
${text}

Gi en kortfattet norsk tittel (maks ca. 10 ord) som beskriver INNHOLDET i saken — ikke nødvendigvis lik VGs originaltittel — og 3-5 punkter som sammendrag av de viktigste faktaene.`,
        },
      ],
    });
    await recordUsage(response.usage);

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { title?: unknown; bullets?: unknown };
    if (typeof parsed.title !== "string" || !Array.isArray(parsed.bullets)) return null;
    const bullets = parsed.bullets.filter((b): b is string => typeof b === "string");
    if (!bullets.length) return null;
    return { title: parsed.title, bullets };
  } catch {
    return null;
  }
}

export async function getNews(): Promise<NewsItem[]> {
  const cached = await getJSON<NewsItem[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (mitt-dashboard privat nyhetsboks)" } });
  if (!res.ok) throw new Error(`VG RSS feil: ${res.status}`);
  const xml = await res.text();
  const filtered = parseFeed(xml)
    .filter((item) => !isNoiseItem(item))
    .slice(0, RAW_WINDOW);
  const candidates = prioritizeStories(filtered);

  // Går gjennom kandidatene i prioritert rekkefølge og fyller opp TOP_N
  // REELLE saker — VGTV-videosaker hoppes over og erstattes av neste
  // kandidat i stedet for å telle som en fylt plass. Den dyre AI-tolkningen
  // kjører maks én gang per cache-TTL (15 min) uansett hvor mange ganger
  // siden lastes, siden hele det ferdig-bearbeidede resultatet caches
  // sammen med resten av nyhetsdataen under.
  const enriched: NewsItem[] = [];
  for (const item of candidates) {
    if (enriched.length >= TOP_N) break;
    const page = await fetchArticlePage(item.link);
    if (page?.isVideo) continue;
    if (!page) {
      enriched.push(item);
      continue;
    }
    const ai = await summarizeText(item, page.text);
    enriched.push(ai ? { ...item, aiTitle: ai.title, summaryBullets: ai.bullets } : item);
  }

  await setJSON(CACHE_KEY, enriched, CACHE_TTL_SECONDS);
  return enriched;
}
