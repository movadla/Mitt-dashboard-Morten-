import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hgetJSON, hsetJSON, hgetallJSON } from "./kv";
import { recordUsage } from "./aiUsage";
import { localDateString } from "./payday";
import {
  AI_TIPS_CATEGORIES,
  AI_TIPS_CATEGORY_LABELS,
  type AiTipCategory,
  type AiTip,
  type AiTipFeedback,
  type AiTipFeedbackInput,
  type AiTipResource,
} from "./aiTipsTypes";

export type { AiTipCategory, AiTip, AiTipFeedback, AiTipFeedbackInput, AiTipResource } from "./aiTipsTypes";
export { AI_TIPS_CATEGORIES, AI_TIPS_CATEGORY_LABELS } from "./aiTipsTypes";

interface KnownGap {
  category: AiTipCategory;
  topic: string;
  date: string;
}

interface AiTipsProfile {
  categoryLevels: Record<AiTipCategory, number>;
  recentTitles: string[];
  knownGaps: KnownGap[];
  wantsMore: KnownGap[];
  updatedAt: string;
}

const TIPS_HASH_KEY = "privat:ai-tips";
const PROFILE_HASH_KEY = "privat:ai-tips-profile";
const PROFILE_FIELD = "state";
const MODEL = "claude-haiku-4-5";

// Morten er en viderekommen AI-PRAKTIKER, ikke nybegynner — han har bygget hele
// dette dashboardet (og to andre apper) ved å INSTRUERE Claude Code, ikke ved å
// skrive koden selv. Startnivåene under reflekterer det, og persona-teksten
// ber eksplisitt om å unngå "hva er en chatbot"-nivå innhold og heller referere
// til hans egne, navngitte prosjekter der det er naturlig.
const DEFAULT_CATEGORY_LEVELS: Record<AiTipCategory, number> = {
  prompting: 3,
  modeller: 3,
  verktoy: 2,
  appbygging: 3,
  automatisering: 2,
  effektivitet: 2,
  nyheter: 3,
};

const PERSONA_CONTEXT = `Morten jobber i Mustad Eiendom (eiendomsforvaltning/utleie i Oslo-området, paraplymerker: Mustad Eiendom, Lilleakerbyen, CC Vest, Fåd, Lilleaker Live, Fåbro Hage). På jobb bruker han Claude aktivt i et "Inntektsprognose"-verktøy som henter og krysskobler data fra Fazile (utleie-/kontraktssystem), Visma Business NXT (regnskap) og Salesforce (saker), med automatisk klassifisering, budsjett-kobling og avviksforklaring.

Privat har han bygget DETTE dashboardet ("mitt-dashboard": Next.js/React/TypeScript/Redis, med Kalender, Dagbok, Trening m/ ryggrehab-modul, Økonomi, Nyheter osv.) HELT SELV, ved å instruere Claude Code (en agentisk kodeassistent i terminalen) — ikke ved å skrive koden for hånd selv. Han har på samme måte bygget "Mikke Mus" (en dart-skår-app med Scolia-brett-integrasjon) og "Boko Haramsdale" (en Fantasy Premier League-side).

Han er ALTSÅ IKKE nybegynner på å bruke AI til å bygge ting — han er en viderekommen praktiker som lærer å bli enda bedre og bredere (ikke bare "kodeassistent", men promptteknikk generelt, andre AI-verktøy, automatiseringstankegang, hvordan velge riktig Claude-modell til riktig oppgave, osv). Unngå "hva er en chatbot/hva er AI"-nivå innhold. Referer til hans egne, navngitte prosjekter over når det er naturlig og faktisk relevant for dagens tema — ikke tving det inn hvis det ikke passer.`;

function defaultProfile(): AiTipsProfile {
  return {
    categoryLevels: { ...DEFAULT_CATEGORY_LEVELS },
    recentTitles: [],
    knownGaps: [],
    wantsMore: [],
    updatedAt: new Date().toISOString(),
  };
}

async function getProfile(): Promise<AiTipsProfile> {
  const stored = await hgetJSON<AiTipsProfile>(PROFILE_HASH_KEY, PROFILE_FIELD);
  if (!stored) return defaultProfile();
  // Nye kategorier lagt til i senere versjoner mangler i eldre lagrede profiler —
  // fylles inn med default i stedet for å bli `undefined` i prompten.
  const categoryLevels = { ...DEFAULT_CATEGORY_LEVELS, ...stored.categoryLevels };
  return { ...stored, categoryLevels, wantsMore: stored.wantsMore ?? [] };
}

async function saveProfile(profile: AiTipsProfile): Promise<void> {
  await hsetJSON(PROFILE_HASH_KEY, PROFILE_FIELD, profile);
}

function clampLevel(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n * 10) / 10));
}

function buildSystemPrompt(profile: AiTipsProfile): string {
  const levelsText = AI_TIPS_CATEGORIES.map(
    (c) => `- ${c} (${AI_TIPS_CATEGORY_LABELS[c]}): nivå ${profile.categoryLevels[c].toFixed(1)}/5`,
  ).join("\n");
  const recentText =
    profile.recentTitles.length > 0
      ? `Emner han NYLIG har fått (ikke gjenta disse, verken tema eller vinkling):\n${profile.recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "Han har ikke fått noen tips ennå — dette er det aller første. Start et sted som er nyttig og konkret, ikke en generisk «velkommen»-tekst.";
  const gapsText =
    profile.knownGaps.length > 0
      ? `Flaggede kunnskapshull (konkrete deltemaer han selv merket som «vanskelig å forstå» — ta opp igjen i en ENKLERE vri når det passer naturlig i rotasjonen, i stedet for å gå videre):\n${profile.knownGaps
          .map((g) => `- [${g.category}] ${g.topic} (${g.date})`)
          .join("\n")}`
      : "";
  const wantsMoreText =
    profile.wantsMore.length > 0
      ? `Deltemaer han selv har bedt om å lære MER om (prioriter disse når naturlig i rotasjonen):\n${profile.wantsMore
          .map((g) => `- [${g.category}] ${g.topic} (${g.date})`)
          .join("\n")}`
      : "";

  return `Du lager ETT kort, daglig AI-lærings-tips for Morten, ment å leses på et par minutter, med en valgfri "les mer"-dybde. Målet er at han over tid faktisk lærer mye om AI, ikke at han bare skummer noe generisk.

${PERSONA_CONTEXT}

Kategorier og hans nåværende anslåtte nivå (1 = helt nytt for ham i den kategorien, 5 = avansert/ekspertnivå):
${levelsText}

${recentText}

${gapsText}

${wantsMoreText}

Velg selv hvilken KATEGORI og hvilket NIVÅ dagens tips skal ligge på, ut fra disse prinsippene:
1. Hold en sunn progresjon over tid — ikke samme kategori mange dager på rad, men heller ikke ren tilfeldig rekkefølge. Prioriter kategorier med lavest nivå, flaggede hull, eller emner han selv har bedt om mer av.
2. Pitch innholdet PRESIST på oppgitt nivå for kategorien — ikke lavere (kjedelig, føles som bortkastet tid) og ikke høyere (uforståelig).
3. Bruk web_search-verktøyet til å finne 1-3 KONKRETE, ekte eksterne ressurser som utdyper akkurat DAGENS tema — bruk KUN ressurser du faktisk fant via søket, ALDRI noe du "husker" eller gjetter deg til. Har du ikke funnet noe genuint relevant, la resources-lista være tom i stedet for å dikte opp noe. Morten setter spesielt pris på gode KONTOER å følge (på X/Twitter, Instagram eller Facebook) som jevnlig deler konkrete AI-use cases, prompts eller fremgangsmåter innenfor dagens tema — let aktivt etter dette (type "konto") i tillegg til artikler/videoer, ikke bare som en siste utvei.
4. Vær konkret og praktisk — gjerne et lite eksempel, en konkret fremgangsmåte, eller en kobling til et av hans egne navngitte prosjekter der det passer naturlig.
5. Bryt dagens tema ned i 2-5 korte, konkrete DELEMNER ("subtopics") — dette brukes som avkrysningsalternativer når han gir tilbakemelding, så de må være spesifikke nok til å faktisk bety noe (f.eks. "Few-shot prompting" og "System- vs. user-prompt", ikke bare "Prompting").

Svar KUN med gyldig JSON på nøyaktig denne formen, ingen annen tekst før eller etter:
{
  "category": string (nøyaktig én av: ${AI_TIPS_CATEGORIES.join(", ")}),
  "level": number (1-5),
  "title": string (kort, konkret, ikke klikkbait),
  "summary": string (den korte daglige lesingen — noen setninger, lesbar på under 2 minutter),
  "details": string (dypere innhold til "les mer" — konkret fremgangsmåte/eksempel, gjerne noen avsnitt),
  "subtopics": string[] (2-5 korte, konkrete delemner dagens tips dekker),
  "resources": [{ "type": "artikkel"|"video"|"konto"|"annet", "title": string, "url": string, "source": string, "why": string }]
}`;
}

interface RawAiTipJson {
  category?: unknown;
  level?: unknown;
  title?: unknown;
  summary?: unknown;
  details?: unknown;
  subtopics?: unknown;
  resources?: unknown;
}

function isCategory(v: unknown): v is AiTipCategory {
  return typeof v === "string" && (AI_TIPS_CATEGORIES as readonly string[]).includes(v);
}

function parseSubtopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 5);
}

function parseResources(raw: unknown): AiTipResource[] {
  if (!Array.isArray(raw)) return [];
  const out: AiTipResource[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const obj = r as Record<string, unknown>;
    const url = typeof obj.url === "string" ? obj.url.trim() : "";
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!url || !title || !/^https?:\/\//i.test(url)) continue;
    const type = obj.type === "artikkel" || obj.type === "video" || obj.type === "konto" ? obj.type : "annet";
    out.push({
      type,
      title,
      url,
      source: typeof obj.source === "string" ? obj.source : undefined,
      why: typeof obj.why === "string" ? obj.why : undefined,
    });
    if (out.length >= 3) break;
  }
  return out;
}

async function generateTip(profile: AiTipsProfile): Promise<AiTip | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 4, allowed_callers: ["direct"] }],
      system: buildSystemPrompt(profile),
      messages: [{ role: "user", content: "Lag dagens AI-tips nå." }],
    });
    await recordUsage(response.usage);

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as RawAiTipJson;

    if (!isCategory(parsed.category) || typeof parsed.title !== "string" || typeof parsed.summary !== "string") return null;
    const title = parsed.title.trim();
    const summary = parsed.summary.trim();
    const details = typeof parsed.details === "string" ? parsed.details.trim() : "";
    if (!title || !summary) return null;

    return {
      date: localDateString(),
      category: parsed.category,
      level: clampLevel(typeof parsed.level === "number" ? parsed.level : profile.categoryLevels[parsed.category]),
      title,
      summary,
      details,
      subtopics: parseSubtopics(parsed.subtopics),
      resources: parseResources(parsed.resources),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// Idempotent, lat generering (samme mønster som Rygg-ukene sin "sjekk og lukk
// ved behov"): kalles både fra cronen (forventet vei) og fra GET-endepunktet
// (sikkerhetsnett hvis cronen skulle feile en dag) — treffer alltid samme
// Redis-felt, så dobbeltkjøring samme dag koster ingenting ekstra.
export async function getOrGenerateTodayTip(): Promise<AiTip | null> {
  const today = localDateString();
  const existing = await hgetJSON<AiTip>(TIPS_HASH_KEY, today);
  if (existing) return existing;

  const profile = await getProfile();
  const tip = await generateTip(profile);
  if (!tip) return null;

  await hsetJSON(TIPS_HASH_KEY, today, tip);
  await saveProfile({
    ...profile,
    recentTitles: [tip.title, ...profile.recentTitles].slice(0, 20),
    updatedAt: new Date().toISOString(),
  });
  return tip;
}

export async function getTodayTipStatus(): Promise<{ hasToday: boolean; opened: boolean }> {
  const tip = await hgetJSON<AiTip>(TIPS_HASH_KEY, localDateString());
  return { hasToday: !!tip, opened: !!tip?.openedAt };
}

export async function markTipOpened(date: string): Promise<void> {
  const tip = await hgetJSON<AiTip>(TIPS_HASH_KEY, date);
  if (!tip || tip.openedAt) return;
  await hsetJSON(TIPS_HASH_KEY, date, { ...tip, openedAt: new Date().toISOString() });
}

export async function getArchive(limit = 60): Promise<AiTip[]> {
  const all = await hgetallJSON<AiTip>(TIPS_HASH_KEY);
  return Object.values(all)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

// Nivå-justeringen leser primært av "kunne fra før" (raskeste vei til å heve
// nivået — det er direkte bevis på at vi undervurderte ham), og "forsto"
// justerer ellers finere: skjønte lite av noe nytt -> ned, skjønte mye av noe
// nytt -> et lite hopp opp, den brede midten (matte-tenke-sonen) er akkurat
// der progresjonen skal ligge og rører knapt nivået.
function computeLevelDelta(priorKnowledge: number, understanding: number): number {
  if (priorKnowledge >= 8) return 0.7;
  if (understanding <= 3) return -0.7;
  if (understanding >= 8 && priorKnowledge <= 5) return 0.4;
  if (understanding <= 5) return -0.2;
  return 0.1;
}

export async function submitFeedback(date: string, input: AiTipFeedbackInput): Promise<AiTip | null> {
  const tip = await hgetJSON<AiTip>(TIPS_HASH_KEY, date);
  if (!tip) return null;

  const priorKnowledge = Math.max(1, Math.min(10, Math.round(input.priorKnowledge)));
  const understanding = Math.max(1, Math.min(10, Math.round(input.understanding)));
  const validTopics = new Set(tip.subtopics);
  const difficultTopics = input.difficultTopics.filter((t) => validTopics.has(t));
  const wantMoreTopics = input.wantMoreTopics.filter((t) => validTopics.has(t));
  const difficultNote = input.difficultNote?.trim() || undefined;

  const feedback: AiTipFeedback = {
    priorKnowledge,
    understanding,
    difficultTopics,
    difficultNote,
    wantMoreTopics,
    ratedAt: new Date().toISOString(),
  };
  const nextTip: AiTip = { ...tip, feedback };
  await hsetJSON(TIPS_HASH_KEY, date, nextTip);

  const profile = await getProfile();
  const nextLevel = clampLevel(profile.categoryLevels[tip.category] + computeLevelDelta(priorKnowledge, understanding));
  const newGaps = difficultTopics.map((topic) => ({ category: tip.category, topic, date }));
  const newWantsMore = wantMoreTopics.map((topic) => ({ category: tip.category, topic, date }));

  await saveProfile({
    ...profile,
    categoryLevels: { ...profile.categoryLevels, [tip.category]: nextLevel },
    knownGaps: [...profile.knownGaps, ...newGaps].slice(-15),
    wantsMore: [...profile.wantsMore, ...newWantsMore].slice(-15),
    updatedAt: new Date().toISOString(),
  });

  return nextTip;
}
