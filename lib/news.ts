import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { getJSON, setJSON } from "./kv";
import { recordUsage } from "./aiUsage";

export interface NewsItem {
  title: string;
  link: string;
  description?: string;
  // Normalisert kategori — AI-klassifisert (se summarizeText), faller tilbake
  // til en enkel kilde-avledet gjetning hvis AI-kallet feiler for saken.
  category?: string;
  pubDate?: string;
  image?: string;
  source: string; // "VG" | "TV2" | "Dagbladet" | "Nettavisen"
  importance?: "lav" | "medium" | "høy";
  // Claude-tolket tittel/sammendrag av selve artikkelen — se summarizeText.
  // Usatt hvis AI-kallet feilet eller ANTHROPIC_API_KEY ikke er satt; UI-en
  // faller da tilbake til title/description.
  aiTitle?: string;
  // Én kort setning — vist FØRST når man utvider en sak, før man evt. trykker
  // "Mer" for summaryBullets/full artikkel. UI-en faller tilbake til første
  // punkt i summaryBullets, eller en avkortet description, hvis usatt.
  oneLiner?: string;
  summaryBullets?: string[];
  // Antall ULIKE kilder som melder samme sak (tittel-overlapp, se
  // isDuplicateTitle) — usatt/1 hvis kun én kilde har den. Flere kilder om
  // samme sak er signalet "I dag"-widgeten bruker for å avgjøre om noe er
  // viktig nok til å vises uten å måtte utvide boksen, jf. tilbakemelding —
  // ikke AI-en sin isolerte per-artikkel-vurdering alene. Kun satt av
  // getNews sin dedup-løkke, aldri av processCandidate/kilde-parserne.
  sourceCount?: number;
}

// Interne felt kun brukt under innsamling — aldri en del av det som caches/
// returneres (strippes i processCandidate).
interface Candidate extends NewsItem {
  // Nettavisen har HELE artikkelen embedded i RSS-responsen
  // (<content:encoded>) — ingen egen artikkel-henting nødvendig for den kilden.
  prefetchedText?: string;
  // Avgjort ved parsing for kilder der vi ikke gjør et eget sidekall (Nettavisen).
  isVideo?: boolean;
}

const CACHE_KEY = "cache:news:aggregert";
// Hvor lenge cachen regnes som FERSK — utløpt cache serveres likevel (se
// getNews), bare markert for bakgrunnsoppdatering, så denne styrer kun hvor
// ofte vi PRØVER å friske opp, ikke hvor lenge brukeren må vente.
const CACHE_FRESH_SECONDS = 15 * 60;
// Sikkerhetsnett i Redis — reell "aldri be om denne igjen"-grense, mye lenger
// enn CACHE_FRESH_SECONDS. Praksis: getNews returnerer alltid stale data
// umiddelbart og friskner opp i bakgrunnen, så denne rammer kun en app som
// har stått helt urørt i flere dager.
const CACHE_SAFETY_TTL_SECONDS = 24 * 60 * 60;
const MODEL = "claude-haiku-4-5";
const TOP_N = 10;
const BATCH_SIZE = 5;
const UA = { headers: { "User-Agent": "Mozilla/5.0 (mitt-dashboard privat nyhetsboks)" } };

interface NewsCache {
  items: NewsItem[];
  fetchedAt: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Generiske numeriske/hex-entities — Dagbladet sine enclosure-URL-er
    // bruker &#x2F; (/) og &#x3D; (=) i stedet for de navngitte over.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return undefined;
  const raw = match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1");
  const decoded = decodeEntities(raw);
  return decoded || undefined;
}

function extractAttr(block: string, tag: string, attr: string): string | undefined {
  const tagMatch = block.match(new RegExp(`<${tag}[^>]*/?>`, "i"));
  if (!tagMatch) return undefined;
  const attrMatch = tagMatch[0].match(new RegExp(`${attr}="([^"]*)"`, "i"));
  return attrMatch ? decodeEntities(attrMatch[1]) : undefined;
}

// Feilaktige/støy-titler observert i praksis — foreløpig kun fra VG sin
// kronologiske firehose (måltikker/bildetekster), men sjekket generisk mot
// alle kilder som et billig sikkerhetsnett.
const NOISE_TITLE_PATTERNS = [/^se\b/i, /^her (ser|er)\b/i, /^scoring for\b/i, /^\d+-\d+:/];

function isNoiseItem(item: NewsItem): boolean {
  return NOISE_TITLE_PATTERNS.some((p) => p.test(item.title)) || item.link.includes("/video/");
}

const CATEGORY_OPTIONS = ["Nyheter", "Sport", "Underholdning", "Økonomi", "Utenriks", "Annet"] as const;
type Category = (typeof CATEGORY_OPTIONS)[number];

// Enkel, billig kategori-gjetning fra URL-stien — brukt som fallback for
// kilder uten egen kategori-tag (Dagbladet/Nettavisen), og hvis AI-kallet
// feiler for en sak fra hvilken som helst kilde.
function categoryFromPath(url: string): Category {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    const map: Record<string, Category> = {
      nyheter: "Nyheter",
      sport: "Sport",
      kjendis: "Underholdning",
      underholdning: "Underholdning",
      okonomi: "Økonomi",
      "norsk-debatt": "Nyheter",
      meninger: "Nyheter",
      utenriks: "Utenriks",
    };
    return map[seg] ?? "Annet";
  } catch {
    return "Annet";
  }
}

// ── Kilde-parsere ────────────────────────────────────────────────────────────

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`Feed-feil (${url}): ${res.status}`);
  return res.text();
}

function itemBlocks(xml: string): string[] {
  return xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
}

// VG sin RSS ("Siste nytt fra VG") er en kronologisk firehose på tvers av
// alle kategorier (Nyheter/Sport/E24/...) og returnerer i praksis alltid kun
// de ~10 siste publiseringene totalt — ofte dominert av Sport sin
// minutt-for-minutt-tikker. Har likevel et ekte, unikt bilde per sak
// (<enclosure url>), verifisert 22.08.2026.
function parseVg(xml: string): Candidate[] {
  const items: Candidate[] = [];
  for (const block of itemBlocks(xml)) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      description: extractTag(block, "description"),
      category: extractTag(block, "category") ?? "Nyheter",
      pubDate: extractTag(block, "pubDate"),
      image: extractAttr(block, "enclosure", "url"),
      source: "VG",
    });
  }
  return items;
}

// TV2 (Labrador CMS) — rene, veldrevne kategori-feeds, ekte bilde per sak,
// egen <category domain="section">-tag per sak.
function parseTv2(xml: string, fallbackCategory: Category): Candidate[] {
  const items: Candidate[] = [];
  for (const block of itemBlocks(xml)) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    const sectionMatch = block.match(/<category domain="section">([\s\S]*?)<\/category>/);
    items.push({
      title,
      link,
      description: extractTag(block, "description"),
      category: sectionMatch ? decodeEntities(sectionMatch[1]) : fallbackCategory,
      pubDate: extractTag(block, "pubDate"),
      image: extractAttr(block, "enclosure", "url"),
      source: "TV2",
    });
  }
  return items;
}

// Dagbladet (samme Labrador-plattform som TV2) — kun /rss/nyheter fungerte av
// flere forsøkte URL-mønstre, ingen egen kategori-tag → avledet fra URL-sti.
function parseDagbladet(xml: string): Candidate[] {
  const items: Candidate[] = [];
  for (const block of itemBlocks(xml)) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      description: extractTag(block, "description"),
      category: categoryFromPath(link),
      pubDate: extractTag(block, "pubDate"),
      image: extractAttr(block, "enclosure", "url"),
      source: "Dagbladet",
    });
  }
  return items;
}

function isVideoHtml(html: string): boolean {
  const ogType = html.match(/<meta[^>]*property="og:type"[^>]*content="([^"]*)"/i)?.[1] ?? "";
  if (ogType.toLowerCase().startsWith("video")) return true;
  return /<meta[^>]*property="og:site_name"[^>]*content="VGTV"/i.test(html);
}

// Nettavisen sin rich-rss har HELE artikkelen (inkl. bilder, og-metadata)
// embedded direkte i <content:encoded> — ingen egen artikkel-henting
// nødvendig, verken for tekst, bilde eller video-avgjørelse.
function parseNettavisen(xml: string): Candidate[] {
  const items: Candidate[] = [];
  for (const block of itemBlocks(xml)) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    const html = extractTag(block, "content:encoded") ?? "";
    // <enclosure url="..."> ligger på selve <item>-nivået (utenfor content:
    // encoded) og er til stede på så godt som alle saker — foretrekkes fremfor
    // et embedded <img> i artikkelteksten, som mangler på rene tekst-/
    // debattsaker uten eget bilde tidlig i brødteksten.
    const enclosureUrl = extractAttr(block, "enclosure", "url");
    const embeddedImg = html.match(/<img[^>]*src="([^"]*)"/i)?.[1];
    const image = enclosureUrl ?? (embeddedImg ? decodeEntities(embeddedImg) : undefined);
    items.push({
      title,
      link,
      description: extractTag(block, "description"),
      category: categoryFromPath(link),
      pubDate: extractTag(block, "pubDate"),
      image,
      source: "Nettavisen",
      prefetchedText: stripHtmlToText(html),
      isVideo: isVideoHtml(html),
    });
  }
  return items;
}

const SOURCES: Array<{ name: string; fetch: () => Promise<Candidate[]> }> = [
  { name: "VG", fetch: () => fetchXml("https://www.vg.no/rss/feed").then(parseVg) },
  { name: "TV2 nyheter", fetch: () => fetchXml("https://www.tv2.no/rss/nyheter").then((xml) => parseTv2(xml, "Nyheter")) },
  { name: "TV2 sport", fetch: () => fetchXml("https://www.tv2.no/rss/sport").then((xml) => parseTv2(xml, "Sport")) },
  {
    name: "TV2 underholdning",
    fetch: () => fetchXml("https://www.tv2.no/rss/underholdning").then((xml) => parseTv2(xml, "Underholdning")),
  },
  { name: "Dagbladet", fetch: () => fetchXml("https://www.dagbladet.no/rss/nyheter").then(parseDagbladet) },
  { name: "Nettavisen", fetch: () => fetchXml("https://www.nettavisen.no/service/rich-rss").then(parseNettavisen) },
];

// ── Artikkeltekst + AI-tolkning ──────────────────────────────────────────────

// Strip HTML til ren tekst — regex-basert (ingen HTML-parser-bibliotek i
// prosjektet). Grovt, men holder for å gi Claude nok kontekst; navigasjons-/
// reklametekst som slipper gjennom instrueres modellen selv til å ignorere.
function stripHtmlToText(html: string): string {
  const withoutBoilerplate = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = decodeEntities(withoutBoilerplate.replace(/<[^>]+>/g, " "));
  return text.replace(/\s+/g, " ").trim().slice(0, 6000);
}

async function fetchArticlePage(link: string): Promise<{ text: string; isVideo: boolean } | null> {
  try {
    const res = await fetch(link, UA);
    if (!res.ok) return null;
    const html = await res.text();
    return { text: stripHtmlToText(html), isVideo: isVideoHtml(html) };
  } catch {
    return null;
  }
}

interface AiNewsResult {
  title: string;
  oneLiner: string;
  bullets: string[];
  category: Category;
  importance: "lav" | "medium" | "høy";
}

// Kort, statisk personalisering — brukt til å vurdere relevans FOR MORTEN
// spesifikt, ikke generell nyhetsverdi. Holdt bevisst enkel (jobb/familie/
// interesser), ikke koblet til live data fra resten av appen.
const PERSONA_CONTEXT =
  "Personen dette vurderes for: Morten, jobber med eiendomsforvaltning (Mustad Eiendom) i Oslo-området, " +
  "har en liten sønn, og er interessert i fotball/Fantasy Premier League og dart.";

// Ber Claude Haiku om en tolket tittel (ikke kildens egen) + punktvis
// sammendrag + normalisert kategori + personlig viktighetsvurdering, alt i
// ÉTT kall. Returnerer null ved ethvert feilsteg — kalleren faller da
// tilbake til den rå saken (kilde-tittel, kilde-avledet kategori-gjetning,
// ingen sammendrag/viktighet), aldri en hard feil for hele boksen.
async function summarizeText(item: { title: string }, text: string): Promise<AiNewsResult | null> {
  if (!process.env.ANTHROPIC_API_KEY || !text) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        'Du hjelper til med å tolke norske nyhetsartikler. Svar KUN med gyldig JSON på formen ' +
        '{"title": string, "oneLiner": string, "bullets": string[], "category": string, "importance": string} — ingen annen tekst før eller etter. ' +
        `"category" MÅ være nøyaktig én av: ${CATEGORY_OPTIONS.join(", ")}. ` +
        `"importance" MÅ være nøyaktig én av: lav, medium, høy. ${PERSONA_CONTEXT} Vurder "importance" som relevans for AKKURAT DENNE PERSONEN spesifikt, ikke generell nyhetsverdi.`,
      messages: [
        {
          role: "user",
          content: `Artikkelens originaltittel: "${item.title}"

Artikkeltekst (kan inneholde noe navigasjons-/reklametekst fra siden rundt selve artikkelen — ignorer det som klart ikke er brødteksten):
${text}

Gi: 1) en kortfattet norsk tittel (maks ca. 10 ord) som beskriver INNHOLDET i saken, 2) ÉN kort setning (maks ca. 20 ord) som gir kjernen i saken — dette er det FØRSTE brukeren ser, før et eventuelt "mer"-trykk, 3) 3-5 punkter som utdypende sammendrag av de viktigste faktaene, 4) kategori, 5) viktighet for personen beskrevet over.`,
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
    const parsed = JSON.parse(match[0]) as {
      title?: unknown;
      oneLiner?: unknown;
      bullets?: unknown;
      category?: unknown;
      importance?: unknown;
    };
    if (typeof parsed.title !== "string" || !Array.isArray(parsed.bullets)) return null;
    const bullets = parsed.bullets.filter((b): b is string => typeof b === "string");
    if (!bullets.length) return null;
    const oneLiner = typeof parsed.oneLiner === "string" && parsed.oneLiner.trim() ? parsed.oneLiner.trim() : bullets[0];
    const category: Category =
      typeof parsed.category === "string" && (CATEGORY_OPTIONS as readonly string[]).includes(parsed.category)
        ? (parsed.category as Category)
        : "Annet";
    const importance: AiNewsResult["importance"] =
      parsed.importance === "lav" || parsed.importance === "medium" || parsed.importance === "høy" ? parsed.importance : "medium";
    return { title: parsed.title, oneLiner, bullets, category, importance };
  } catch {
    return null;
  }
}

// ── Duplikat-sjekk på tvers av kilder ────────────────────────────────────────

// Enkel, "godt nok"-deduplisering: normaliserer tittel til et sett av
// betydningsfulle ord (4+ bokstaver, uten diakritiske tegn), sammenligner
// overlapp mot allerede valgte saker. Fanger opp "samme sak, ulik overskrift
// hos to aviser" i de fleste tilfeller — ikke ekte NLP-basert.
function significantWords(title: string): Set<string> {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/gi, " ");
  return new Set(normalized.split(/\s+/).filter((w) => w.length >= 4));
}

// Returnerer indeksen i `seen` en tittel matcher (samme sak, ulik kilde),
// eller -1 hvis den ikke matcher noe allerede holdt. Indeksbasert (ikke bare
// boolsk) slik at kalleren kan telle kryss-kilde-dekning på RIKTIG sak i
// stedet for bare å luke duplikatet vekk.
function findDuplicateIndex(words: Set<string>, seen: Set<string>[]): number {
  if (words.size === 0) return -1;
  for (let i = 0; i < seen.length; i++) {
    const other = seen[i];
    if (other.size === 0) continue;
    let overlap = 0;
    for (const w of words) if (other.has(w)) overlap++;
    if (overlap / Math.min(words.size, other.size) >= 0.5) return i;
  }
  return -1;
}

// ── Kandidat-prosessering ────────────────────────────────────────────────────

// Returnerer null hvis saken skal HOPPES OVER (video — telles ikke som en
// fylt plass). Ellers den ferdige (evt. AI-berikede) saken.
async function processCandidate(candidate: Candidate): Promise<NewsItem | null> {
  const { prefetchedText, isVideo: precomputedIsVideo, ...base } = candidate;

  let text = prefetchedText;
  let isVideo = !!precomputedIsVideo;
  if (text === undefined) {
    const page = await fetchArticlePage(candidate.link);
    if (page) {
      text = page.text;
      isVideo = page.isVideo;
    }
  }
  if (isVideo) return null;
  if (!text) return base;

  const ai = await summarizeText(base, text);
  if (!ai) return base;
  return { ...base, aiTitle: ai.title, oneLiner: ai.oneLiner, summaryBullets: ai.bullets, category: ai.category, importance: ai.importance };
}

// Selve innsamlings-/AI-berikings-løpet — uendret logikk, bare trukket ut som
// egen funksjon slik at getNews kan kjøre den enten synkront (helt kald
// cache) eller i bakgrunnen uten å blokkere responsen (utløpt-men-brukbar
// cache), se getNews under.
async function fetchAndEnrichNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(SOURCES.map((s) => s.fetch()));
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const candidates = all
    .filter((item) => !isNoiseItem(item))
    .sort((a, b) => new Date(b.pubDate ?? 0).getTime() - new Date(a.pubDate ?? 0).getTime());

  // Prosesseres i samtidige bolker i stedet for én om gangen — vi må typisk
  // prøve 15-20 kandidater (noen skrelles bort som video/duplikat) for å
  // fylle TOP_N reelle saker, og et rent sekvensielt løp (artikkel-henting +
  // Claude-kall per kandidat) ville gjort et enkelt friskt-opp-løp for treg.
  const enriched: NewsItem[] = [];
  const seenWords: Set<string>[] = [];
  // Parallell til seenWords/enriched — hvilke KILDER (VG/TV2/...) som
  // allerede har bidratt til hver holdte sak, for å telle sourceCount uten å
  // dobbelttelle om samme kilde skulle dukke opp to ganger for samme sak.
  const seenSources: Set<string>[] = [];
  for (let i = 0; i < candidates.length && enriched.length < TOP_N; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const processed = await Promise.all(batch.map(processCandidate));
    for (const item of processed) {
      if (!item) continue; // video
      const words = significantWords(item.aiTitle ?? item.title);
      const dupIdx = findDuplicateIndex(words, seenWords);
      if (dupIdx !== -1) {
        // Samme sak som en allerede holdt fra en annen kilde — teller som
        // kryss-kilde-dekning (se sourceCount) i stedet for en ny fylt
        // plass i TOP_N.
        if (!seenSources[dupIdx].has(item.source)) {
          seenSources[dupIdx].add(item.source);
          enriched[dupIdx].sourceCount = (enriched[dupIdx].sourceCount ?? 1) + 1;
        }
        continue;
      }
      if (enriched.length >= TOP_N) continue;
      seenWords.push(words);
      seenSources.push(new Set([item.source]));
      enriched.push({ ...item, sourceCount: 1 });
    }
  }

  return enriched;
}

// Modul-nivå flagg (ikke i Redis) — hindrer at flere forespørsler som
// ankommer mens cachen er utløpt, hver især trigger sitt eget fulle
// friskt-opp-løp (15-20 artikkel-henter + Claude-kall om gangen). Nullstilles
// alltid i finally, og er bevisst prosess-lokal: verste konsekvens av en
// dobbel-trigger på tvers av flere serverinstanser er én ekstra oppfriskning,
// ikke feil data.
let refreshing = false;

function refreshNewsInBackground(): void {
  if (refreshing) return;
  refreshing = true;
  // next/server sin after() — IKKE bare et fire-and-forget-kall. På Vercel
  // (serverless) fryses/avsluttes funksjonsinstansen rett etter at responsen
  // er sendt, så et rent .then()-kall uten after() ble drept midt i løpet før
  // det rakk å skrive den ferske cachen tilbake — det var årsaken til at
  // nyhetene sluttet å oppdatere seg i produksjon (fungerte fint lokalt, der
  // Node-prosessen lever videre mellom forespørsler). after() ber plattformen
  // holde funksjonen i live til denne callbacken er ferdig.
  after(async () => {
    try {
      const items = await fetchAndEnrichNews();
      await setJSON<NewsCache>(CACHE_KEY, { items, fetchedAt: Date.now() }, CACHE_SAFETY_TTL_SECONDS);
    } catch {
      // Stille — neste forespørsel prøver igjen, og brukeren har uansett
      // allerede fått den stale (men brukbare) cachen servert.
    } finally {
      refreshing = false;
    }
  });
}

// Stale-while-revalidate: en utløpt cache returneres UMIDDELBART (fortsatt
// nyttig — nyheter noen minutter gamle er ikke feil), mens en fersk versjon
// hentes i bakgrunnen for NESTE forespørsel. Uten dette betalte den
// tilfeldige brukeren som traff et cache-miss hver 15. minutt hele kostnaden
// (6 RSS-feeds + opptil ~20 artikkel-henter + Claude-kall) synkront — det var
// årsaken til treg lasting, jf. tilbakemelding. Kun en HELT kald cache (aldri
// hentet før) blokkerer fortsatt, siden det da ikke finnes noe å falle
// tilbake til.
export async function getNews(): Promise<NewsItem[]> {
  const cached = await getJSON<NewsCache>(CACHE_KEY);
  if (cached) {
    const ageSeconds = (Date.now() - cached.fetchedAt) / 1000;
    if (ageSeconds > CACHE_FRESH_SECONDS) refreshNewsInBackground();
    return cached.items;
  }

  const enriched = await fetchAndEnrichNews();
  await setJSON<NewsCache>(CACHE_KEY, { items: enriched, fetchedAt: Date.now() }, CACHE_SAFETY_TTL_SECONDS);
  return enriched;
}
