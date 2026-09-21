import "server-only";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { hgetJSON, hsetJSON, hgetallJSON, hdel, incrWithExpiry, del } from "./kv";
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

export type { AiTipCategory, AiTip, AiTipConfusion, AiTipFeedback, AiTipFeedbackInput, AiTipResource } from "./aiTipsTypes";
export { AI_TIPS_CATEGORIES, AI_TIPS_CATEGORY_LABELS } from "./aiTipsTypes";

interface KnownGap {
  category: AiTipCategory;
  topic: string;
  date: string;
}

interface ImprovementNote {
  category: AiTipCategory;
  topic: string;
  note: string;
  date: string;
}

interface AiTipsProfile {
  categoryLevels: Record<AiTipCategory, number>;
  // Glidende gjennomsnitt (1-10) av "hvor interessert er du i dette?" per
  // kategori — brukes til å VEKTE rotasjonen mot det han faktisk liker best,
  // som et eget signal fra nivå/vanskelighetsgrad.
  categoryInterest: Record<AiTipCategory, number>;
  // Glidende gjennomsnitt (1-10) av "traff dette formen du er ute etter?" —
  // GLOBALT, ikke per kategori, siden formkravet (bred, helhetlig gjennomgang
  // à la "slik kommer du i gang med X") gjelder på tvers av alle kategorier.
  formatFitAvg: number;
  recentTitles: string[];
  knownGaps: KnownGap[];
  wantsMore: KnownGap[];
  improvementNotes: ImprovementNote[];
  updatedAt: string;
}

const DEFAULT_CATEGORY_INTEREST: Record<AiTipCategory, number> = {
  prompting: 5,
  modeller: 5,
  verktoy: 5,
  appbygging: 5,
  automatisering: 5,
  effektivitet: 5,
  nyheter: 5,
};

const TIPS_HASH_KEY = "privat:ai-tips";
const PROFILE_HASH_KEY = "privat:ai-tips-profile";
const PROFILE_FIELD = "state";
// Selve tips-genereringen (buildSystemPrompt) har mange samtidige stilkrav
// (bredt format, enkelt språk, unngå mekanikk, mitt-dashboard-fokus, osv.) —
// Haiku klarte ikke holde alle sammen konsekvent (gled tilbake til smale
// mekanikk-dykk til tross for eksplisitte instrukser, 2026-09-21), så DAGENS
// (ett kall/dag, trivielt billig) bruker Sonnet.
const MODEL = "claude-sonnet-5";
// v2 (2026-09-21, Morten - kostnadsrunde etter et $10-hopp i API-forbruket, spurt
// direkte fra platform.claude.com sin usage-graf): Lager fylles langt oftere enn Dagens
// (opp til 10 stk × samme Sonnet+web_search-kall) og var hovedkilden til hoppet. Morten
// aksepterer at Lager-tips kan bli noe mindre treffsikre stilmessig enn Dagens (samme kjente
// Haiku-svakhet som over) MOT en stor kostnadsreduksjon på det volumet - Lager er den lavere-
// innsats "les når du har tid"-fanen, ikke hoveddagligtipset.
const STOCK_MODEL = "claude-haiku-4-5";
// Forklaring av et enkelt markert ord/setning (explainConfusion) er en langt
// enklere oppgave uten motstridende stilkrav — Haiku er fortsatt riktig valg der.
const EXPLAIN_MODEL = "claude-haiku-4-5";

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

Han er ALTSÅ IKKE nybegynner på å bruke AI til å bygge ting — han er en viderekommen praktiker som lærer å bli enda bedre og bredere (ikke bare "kodeassistent", men promptteknikk generelt, andre AI-verktøy, automatiseringstankegang, hvordan velge riktig Claude-modell til riktig oppgave, osv). Unngå "hva er en chatbot/hva er AI"-nivå innhold. Referer til hans egne, navngitte prosjekter over når det er naturlig og faktisk relevant for dagens tema — ikke tving det inn hvis det ikke passer.

Han har eksplisitt sagt (2026-09-21, TO ganger — dette er IKKE en liten preferanse, det er en gjentatt korreksjon) at han HELST vil lære om KONKRETE USE CASES for å bygge ting med AI — design, appbygging, nettsider, prognoser/analyser, arbeidsflyt-effektivitet — på tvers av ulike livsområder: jobb-relatert, sosialt, privat, og bare for gøy.

UNNGÅ EKSPLISITT: dype dykk i API-/modell-INTERNMEKANIKK som token-regnestykker, cache-parametre/TTL-verdier, thinking-budsjetter, context-window-detaljer, modellbenchmark-tall. Flere tips på rad har drevet inn i akkurat dette (Batch API-kostnader, cache breakpoints, adaptive thinking) til tross for instruksen — det skal IKKE skje igjen. Hvis du kjenner deg selv trekke mot et slikt tema, styr bevisst bort fra det og velg heller noe av dette:
- Konkret app-/nettside-DESIGN (UX-mønstre, hvordan strukturere en ny funksjon, informasjonsarkitektur)
- Hvordan BYGGE noe konkret fra bunnen med AI (en funksjon, et verktøy, en integrasjon)
- Arbeidsflyt-EFFEKTIVITET (hvordan få mer gjort raskere, gode vaner/rutiner rundt AI-bruk)
- Konkrete use cases på tvers av jobb/sosialt/privat/gøy

Mekanikk er OK som en KORT detalj inni en slik use case (f.eks. "husk cache når du bygger dette" i en bisetning), men skal ALDRI være selve hovedtemaet eller tittelen på dagens tips.

FORMAT han faktisk ønsker (ga to konkrete eksempler 2026-09-21 — bruk disse som mal for AMBISJONSNIVÅ og STRUKTUR, ikke som tema å kopiere ordrett):

Eksempel 1 — "Slik kommer du i gang med Claude Code": en helhetlig innføring som dekker de praktiske byggeklossene (registrering, terminal, Remote Control til mobil, Vercel, GitHub, osv.), PLUSS en use case/historie om noen som har gjort noe spennende eller morsomt med det, PLUSS konkrete tips til hva HAN kunne gjort annerledes eller kan begynne å gjøre i sine egne prosjekter der det er aktuelt.

Eksempel 2 — "Slik lager du en inntektsprognose": en helhetlig gjennomgang som dekker API, MCP, viktigheten av god masterdata, hvordan fremstille resultatet, utfordringer med analysen, PLUSS konkrete tips til struktur, avgrensing, og promptteknikk som forbedrer resultat og effektivitet.

Begge eksemplene er BREDE, HELHETLIGE gjennomganger av ett tema — ikke ett smalt, isolert delkonsept slik tidligere tips (cache breakpoints, batch-kostnader) var. "details"-feltet skal derfor være mer omfattende og STRUKTURERT enn før (bruk "**Overskrift:**"-mønsteret for delseksjoner der det gir mening — byggeklosser/hvordan komme i gang, en konkret use case/historie, og til slutt personlige tips til hva han kan gjøre annerledes/starte med), ikke bare et par løse avsnitt. "summary" holder seg likevel kort og i vanlig språk (se punkt 7) — det er en trailer for det rikere innholdet i "details", ikke selve gjennomgangen.

Om "actionablePrompt": IKKE en fast rutine å presse inn i hvert tips — dropp den helt med mindre den er VELDIG relevant og konkret. Et tips kan være helt utmerket uten den.`;

function defaultProfile(): AiTipsProfile {
  return {
    categoryLevels: { ...DEFAULT_CATEGORY_LEVELS },
    categoryInterest: { ...DEFAULT_CATEGORY_INTEREST },
    formatFitAvg: 5,
    recentTitles: [],
    knownGaps: [],
    wantsMore: [],
    improvementNotes: [],
    updatedAt: new Date().toISOString(),
  };
}

// Generisk over Redis-nøkkel slik at Dagens og Lager kan ha HVER SIN
// profil-lagring — se STOCK_PROFILE_HASH_KEY under. Samme merge-/default-
// logikk gjelder for begge.
async function loadProfile(hashKey: string): Promise<AiTipsProfile> {
  const stored = await hgetJSON<AiTipsProfile>(hashKey, PROFILE_FIELD);
  if (!stored) return defaultProfile();
  // Nye kategorier/felt lagt til i senere versjoner mangler i eldre lagrede
  // profiler — fylles inn med default i stedet for å bli `undefined` i prompten.
  const categoryLevels = { ...DEFAULT_CATEGORY_LEVELS, ...stored.categoryLevels };
  const categoryInterest = { ...DEFAULT_CATEGORY_INTEREST, ...stored.categoryInterest };
  return {
    ...stored,
    categoryLevels,
    categoryInterest,
    formatFitAvg: stored.formatFitAvg ?? 5,
    wantsMore: stored.wantsMore ?? [],
    improvementNotes: stored.improvementNotes ?? [],
  };
}

async function persistProfile(hashKey: string, profile: AiTipsProfile): Promise<void> {
  await hsetJSON(hashKey, PROFILE_FIELD, profile);
}

async function getProfile(): Promise<AiTipsProfile> {
  return loadProfile(PROFILE_HASH_KEY);
}

async function saveProfile(profile: AiTipsProfile): Promise<void> {
  await persistProfile(PROFILE_HASH_KEY, profile);
}

function clampLevel(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n * 10) / 10));
}

function buildSystemPrompt(profile: AiTipsProfile, forceCategory?: AiTipCategory): string {
  const levelsText = AI_TIPS_CATEGORIES.map(
    (c) =>
      `- ${c} (${AI_TIPS_CATEGORY_LABELS[c]}): nivå ${profile.categoryLevels[c].toFixed(1)}/5, interesse ${profile.categoryInterest[c].toFixed(1)}/10`,
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
  const improvementNotesText =
    profile.improvementNotes.length > 0
      ? `Ting han har bedt om at burde vært forklart BEDRE/DYPERE for å vært mest relevant for ham, knyttet til tidligere tips (bruk disse KUN til å gjøre innholdet bedre DERSOM du uansett ender opp med et beslektet tema i dag via den vanlige progresjonslogikken over — IKKE som en grunn til å velge det temaet oftere. Han har eksplisitt bedt om at dette ikke skal gjøre tipsene ensidig fokusert på én snever interesse):\n${profile.improvementNotes
          .map((n) => `- [${n.category}] om "${n.topic}": ${n.note} (${n.date})`)
          .join("\n")}`
      : "";

  const formatFitText =
    profile.formatFitAvg < 6
      ? `Format-treff siste tilbakemeldinger: ${profile.formatFitAvg.toFixed(1)}/10 — under middels. Følg FORMAT-seksjonen i persona-teksten over MER nøye enn du kanskje har gjort: bred, helhetlig gjennomgang, ikke et smalt delkonsept.`
      : `Format-treff siste tilbakemeldinger: ${profile.formatFitAvg.toFixed(1)}/10 — du treffer formen han er ute etter, fortsett sånn.`;

  return `Du lager ETT kort, daglig AI-lærings-tips for Morten, ment å leses på et par minutter, med en valgfri "les mer"-dybde. Målet er at han over tid faktisk lærer mye om AI, ikke at han bare skummer noe generisk.

${PERSONA_CONTEXT}

${formatFitText}

Kategorier og hans nåværende anslåtte nivå (1 = helt nytt for ham i den kategorien, 5 = avansert/ekspertnivå):
${levelsText}

${recentText}

${gapsText}

${wantsMoreText}

${improvementNotesText}

${
    forceCategory
      ? `Kategorien for DENNE genereringen er allerede bestemt: "${forceCategory}" (${AI_TIPS_CATEGORY_LABELS[forceCategory]}) — ikke velg en annen kategori. Bruk nivået/interessen for akkurat denne kategorien (se over) til å kalibrere innhold og vanskelighetsgrad.\n\n`
      : ""
  }Velg ${forceCategory ? "" : "selv "}hvilket NIVÅ dagens tips skal ligge på, ut fra disse prinsippene:
1. Hold en sunn progresjon over tid — ALDRI samme kategori tre ganger på rad (sjekk kategori-prefikset i hakeparentes i "nylig fått"-lista under), og heller ikke ren tilfeldig rekkefølge. Prioriter kategorier med lavest nivå, flaggede hull, eller emner han selv har bedt om mer av. Vekt OGSÅ mot kategorier med høy interesse-score (han har eksplisitt sagt hvor interessert han er i hver dags tema) — men la aldri interesse alene stoppe progresjonen i de andre kategoriene helt. Uansett hvilken kategori du velger (inkl. "modeller"/"prompting"/"automatisering") skal INNHOLDET vinkles mot design/bygging/effektivitet-bruksmåter, ikke API-internmekanikk — se presiseringen i persona-teksten over.
2. Pitch innholdet PRESIST på oppgitt nivå for kategorien — ikke lavere (kjedelig, føles som bortkastet tid) og ikke høyere (uforståelig).
3. Bruk web_search-verktøyet til å finne 1-3 KONKRETE, ekte eksterne ressurser som utdyper akkurat DAGENS tema — bruk KUN ressurser du faktisk fant via søket, ALDRI noe du "husker" eller gjetter deg til. Har du ikke funnet noe genuint relevant, la resources-lista være tom i stedet for å dikte opp noe. Morten setter spesielt pris på gode KONTOER å følge (på X/Twitter, Instagram eller Facebook) som jevnlig deler konkrete AI-use cases, prompts eller fremgangsmåter innenfor dagens tema — let aktivt etter dette (type "konto") i tillegg til artikler/videoer, ikke bare som en siste utvei.
4. Vær konkret og praktisk — gjerne et lite eksempel, en konkret fremgangsmåte, eller en kobling til et av hans egne navngitte prosjekter der det passer naturlig.
5. Bryt dagens tema ned i 2-5 korte, konkrete DELEMNER ("subtopics") — dette brukes som avkrysningsalternativer når han gir tilbakemelding, så de må være spesifikke nok til å faktisk bety noe (f.eks. "Few-shot prompting" og "System- vs. user-prompt", ikke bare "Prompting").
6. Hvis dagens tema naturlig gir en KONKRET, HOLDBAR handling i ett av hans egne navngitte prosjekter — PRIORITER mitt-dashboard (hans eget Privat/Jobb-dashboard) spesifikt, siden det er der han eksplisitt vil ha forbedrings-/tillegg-idéer, men Mikke Mus/Boko Haramsdale/Inntektsprognose-arbeidet er også aktuelle — f.eks. en kodeendring han kunne bedt Claude Code om, eller noe verdt å be Claude lagre i minnet sitt, skriv et FERDIG UTKAST til en slik instruks i "actionablePrompt"-feltet, skrevet som om Morten selv skriver den til Claude Code (imperativ, konkret). Legg ALLTID ved et kort anslag i "actionableEffort" på formen "Lett/Middels/Vanskelig · ~X min/timer" når du setter actionablePrompt. Bruk dette KUN når forslaget er robust over tid: ALDRI presise detaljer som fort blir utdatert (eksakte linjenummer, dagens dato, midlertidige tall/status/versjon, OG SPESIELT spesifikke AI-modellnavn/-versjoner som "Claude 4.7" — de blir utdatert enda raskere enn koden, beskriv heller EVNEN du mener til, f.eks. "bruk utvidet resonnering/thinking-modus", ikke en bestemt modellversjon). Hvis dagens tema ikke naturlig gir en slik konkret, holdbar handling — utelat begge feltene helt. Ikke tving det inn.
7. "summary" MÅ være forståelig for noen UTEN fagsjargongen, selv om kategorien i seg selv er teknisk — Morten har eksplisitt sagt (2026-09-21) at innhold har vært for teknisk selv etter forrige justering. Skriv summary som du ville forklart det til en kollega over kaffe, ikke som dokumentasjon: unngå ord som "spawne", "orkestrere", "fan-out", "krysskoble", "instans" der et helt vanlig ord sier det samme ("flere AI-er som jobber samtidig", "sette sammen", "kombinere"). Fagord/presisjon hører hjemme i "details", ALDRI i "summary".
8. Hvis et diagram (flytskjema, arkitektur, sekvens, before/after) genuint ville gjort konseptet lettere å forstå enn ren tekst — typisk når du beskriver et forløp, en arbeidsflyt, eller hvordan noe henger sammen — skriv det som gyldig Mermaid-syntaks i "diagram"-feltet (f.eks. "flowchart LR" eller "sequenceDiagram"). Hold det ENKELT: maks 5-7 noder/steg, korte norske tekstetiketter. Utelat feltet helt hvis dagens tema ikke egner seg for et diagram — ikke tving det inn i alle tips.

Svar KUN med gyldig JSON på nøyaktig denne formen, ingen annen tekst før eller etter:
{
  "category": string (nøyaktig én av: ${AI_TIPS_CATEGORIES.join(", ")}),
  "level": number (1-5),
  "title": string (kort, konkret, ikke klikkbait),
  "summary": string (den korte daglige lesingen — noen setninger, lesbar på under 2 minutter),
  "details": string (dypere innhold til "les mer" — konkret fremgangsmåte/eksempel, gjerne noen avsnitt),
  "subtopics": string[] (2-5 korte, konkrete delemner dagens tips dekker),
  "resources": [{ "type": "artikkel"|"video"|"konto"|"annet", "title": string, "url": string, "source": string, "why": string }],
  "actionablePrompt": string (valgfritt — se punkt 6 over, utelates helt hvis ikke relevant),
  "actionableEffort": string (valgfritt — KUN sammen med actionablePrompt, f.eks. "Lett · ~20 min"),
  "diagram": string (valgfritt — gyldig Mermaid-syntaks, se punkt 8, utelates helt hvis ikke relevant)
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
  actionablePrompt?: unknown;
  actionableEffort?: unknown;
  diagram?: unknown;
}

// Grov sikkerhetssjekk, ikke en ekte Mermaid-parser (den kjører uansett
// client-side ved rendering og feiler synlig der om syntaksen skulle være
// ugyldig) — filtrerer bort åpenbart feil/tomt innhold og urimelig lange svar
// før det i det hele tatt lagres.
function parseDiagram(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return undefined;
  return trimmed;
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

// Anthropics web_search-grunning setter automatisk inn <cite index="...">...
// </cite>-tagger rundt siterte utdrag i svarteksten (en del av selve
// citations-funksjonen bak web_search, ikke noe modellen "velger" å skrive) —
// disse ville ellers lekket rått inn i JSON-feltene og vist seg som synlig
// markup i UI-en. Strippes derfor FØR JSON-parsing, som dekker alle feltene
// (title/summary/details/subtopics/resources) i ett steg.
function stripCitationTags(text: string): string {
  return text.replace(/<\/?cite[^>]*>/g, "");
}

async function generateTip(profile: AiTipsProfile, forceCategory?: AiTipCategory, model: string = MODEL): Promise<AiTip | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model,
      // Det rikere, mer omfattende "details"-formatet (2026-09-21) + flere
      // web_search-runder bruker vesentlig mer av token-budsjettet enn det
      // smalere formatet gjorde — 4000 var for knapt og kuttet svaret midt i
      // JSON-en (usynlig feil: ingen exception, bare et svar som ikke matchet
      // JSON-regexen).
      max_tokens: 8000,
      tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 4, allowed_callers: ["direct"] }],
      system: buildSystemPrompt(profile, forceCategory),
      messages: [{ role: "user", content: "Lag dagens AI-tips nå." }],
    });
    await recordUsage(response.usage);

    const raw = stripCitationTags(
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(""),
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("AI-tips: ingen JSON funnet i svaret. stop_reason:", response.stop_reason, "raw slutt:", raw.slice(-500));
      return null;
    }
    const parsed = JSON.parse(match[0]) as RawAiTipJson;

    if (!isCategory(parsed.category) || typeof parsed.title !== "string" || typeof parsed.summary !== "string") {
      console.error("AI-tips: ugyldig JSON-innhold", { category: parsed.category, title: parsed.title, summaryType: typeof parsed.summary });
      return null;
    }
    const title = parsed.title.trim();
    const summary = parsed.summary.trim();
    const details = typeof parsed.details === "string" ? parsed.details.trim() : "";
    if (!title || !summary) return null;
    // Sikkerhetsnett: selv om modellen skulle ignorere forceCategory-
    // instruksen, skal den aldri overstyres av det den selv svarte.
    const category = forceCategory ?? parsed.category;

    return {
      date: localDateString(),
      category,
      level: clampLevel(typeof parsed.level === "number" ? parsed.level : profile.categoryLevels[category]),
      title,
      summary,
      details,
      subtopics: parseSubtopics(parsed.subtopics),
      resources: parseResources(parsed.resources),
      generatedAt: new Date().toISOString(),
      highlights: [],
      confusions: [],
      actionablePrompt:
        typeof parsed.actionablePrompt === "string" && parsed.actionablePrompt.trim()
          ? parsed.actionablePrompt.trim().slice(0, 2000)
          : undefined,
      actionableEffort:
        typeof parsed.actionableEffort === "string" && parsed.actionableEffort.trim()
          ? parsed.actionableEffort.trim().slice(0, 120)
          : undefined,
      diagram: parseDiagram(parsed.diagram),
    };
  } catch (err) {
    console.error("AI-tips: generering feilet", err);
    return null;
  }
}

// Kategori-prefikset er ikke bare kosmetisk: buildSystemPrompt viser
// recentTitles rått til modellen, og uten prefikset var det umulig for den å
// se at f.eks. tre påfølgende dager alle landet på "automatisering" —
// forskjellige titler så ut som forskjellige temaer selv om de tematisk klumpet seg (batch/cache tre ganger på rad, observert 2026-09-21).
function recentTitleEntry(tip: AiTip): string {
  return `[${tip.category}] ${tip.title}`;
}

// Tips lagret FØR highlights/confusions ble lagt til AiTip-formen mangler
// begge feltene helt i Redis (ikke tomme arrays — feltet finnes ikke) — uten
// dette krasjer buildMarkSegments i UI-en på ".map" av undefined for enhver
// eldre tip (observert 2026-09-21 på selve "i dag"-tipset). Samme
// bakoverkompatibilitets-mønster som loadProfile bruker for eldre profiler.
function normalizeTip(tip: AiTip): AiTip {
  return { ...tip, highlights: tip.highlights ?? [], confusions: tip.confusions ?? [] };
}

// Idempotent, lat generering (samme mønster som Rygg-ukene sin "sjekk og lukk
// ved behov"): kalles både fra cronen (forventet vei) og fra GET-endepunktet
// (sikkerhetsnett hvis cronen skulle feile en dag) — treffer alltid samme
// Redis-felt, så dobbeltkjøring samme dag koster ingenting ekstra.
export async function getOrGenerateTodayTip(): Promise<AiTip | null> {
  const today = localDateString();
  const existing = await hgetJSON<AiTip>(TIPS_HASH_KEY, today);
  if (existing) return normalizeTip(existing);

  const profile = await getProfile();
  const tip = await generateTip(profile);
  if (!tip) return null;

  await hsetJSON(TIPS_HASH_KEY, today, tip);
  await saveProfile({
    ...profile,
    recentTitles: [recentTitleEntry(tip), ...profile.recentTitles].slice(0, 20),
    updatedAt: new Date().toISOString(),
  });
  return tip;
}

// Engangs-bootstrapping: fyller arkivet med noen bakoverdaterte tips på tvers
// av ULIKE kategorier med én gang, i stedet for å vente på at den normale
// én-om-dagen-rotasjonen skal komme innom alle over uker — slik at Morten kan
// gi tilbakemelding på flere kategorier samtidig og kalibrere nivå/interesse
// raskt. Rører IKKE "i dag"-feltet.
export async function generateBackfillTip(category: AiTipCategory, dateIso: string): Promise<AiTip | null> {
  const profile = await getProfile();
  const tip = await generateTip(profile, category);
  if (!tip) return null;
  const backdated: AiTip = { ...tip, date: dateIso };
  await hsetJSON(TIPS_HASH_KEY, dateIso, backdated);
  await saveProfile({
    ...profile,
    recentTitles: [recentTitleEntry(tip), ...profile.recentTitles].slice(0, 20),
    updatedAt: new Date().toISOString(),
  });
  return backdated;
}

// ── Lager ("Lager"-fanen) ────────────────────────────────────────────────────
// En stående pool på inntil 10 ekstra tips Morten kan lese/vurdere HELT
// UAVHENGIG av dagens tips. Rettet 2026-09-21: tilbakemelding her SKAL ha
// effekt — bare avgrenset til Lager selv. Derfor sin egen profil
// (STOCK_PROFILE_HASH_KEY), lest/skrevet med de samme loadProfile/
// persistProfile-funksjonene som Dagens bruker på PROFILE_HASH_KEY, men et
// helt annet Redis-felt — Lager-tilbakemelding rører ALDRI Dagens' profil
// (categoryLevels/interesse/rotasjon/kjente hull) og omvendt, i motsetning
// til generateBackfillTip over som bevisst DELER Dagens' profil. `date`-
// feltet på et lager-tips er lager-ID-en, ikke en ekte kalenderdato — kun
// brukt som Redis-nøkkel/API-parameter.
const STOCK_HASH_KEY = "privat:ai-tips-stock";
const STOCK_PROFILE_HASH_KEY = "privat:ai-tips-stock-profile";
// v2 (2026-09-21, Morten - samme kostnadsrunde som STOCK_MODEL): senket fra 10 til 4 - Lagers
// standende buffer var hovedkilden til et $10-hopp i API-forbruket (en pool på 10 fylles opp med
// like mange Sonnet+web_search-kall som 10 "Dagens"-tips ville kostet, gjentatt hver gang Morten
// krysser av). Eksisterende overskytende tips i Redis rører vi IKKE nå (Morten: "ikke vits å
// fjerne eller legge til noe i lageret nå, bare når jeg går tom") - de blir liggende til han
// leser dem ferdig, og etterfyllingen bruker det nye, lavere målet fra da av.
export const STOCK_TARGET = 4;

async function getStockProfile(): Promise<AiTipsProfile> {
  return loadProfile(STOCK_PROFILE_HASH_KEY);
}

async function saveStockProfile(profile: AiTipsProfile): Promise<void> {
  await persistProfile(STOCK_PROFILE_HASH_KEY, profile);
}

export async function getStock(): Promise<AiTip[]> {
  const all = await hgetallJSON<AiTip>(STOCK_HASH_KEY);
  return Object.values(all).map(normalizeTip).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

// Kategorien trekkes fortsatt tilfeldig (i motsetning til Dagens' egen
// rotasjonslogikk) for å holde poolen bredt dekkende på tvers av kategorier
// samtidig — men NIVÅ/interesse/format-treff innenfor hver kategori kommer nå
// fra Lagers egen, akkumulerte profil, ikke fra en tom default hver gang.
async function generateStockItem(): Promise<AiTip | null> {
  const profile = await getStockProfile();
  const category = AI_TIPS_CATEGORIES[Math.floor(Math.random() * AI_TIPS_CATEGORIES.length)];
  const tip = await generateTip(profile, category, STOCK_MODEL);
  if (!tip) return null;
  const id = randomUUID();
  const stockTip: AiTip = { ...tip, date: id };
  await hsetJSON(STOCK_HASH_KEY, id, stockTip);
  await saveStockProfile({
    ...profile,
    recentTitles: [recentTitleEntry(tip), ...profile.recentTitles].slice(0, 20),
    updatedAt: new Date().toISOString(),
  });
  return stockTip;
}

const STOCK_FILL_LOCK_KEY = "privat:ai-tips-stock-fill-lock";
const STOCK_FILL_LOCK_TTL_SECONDS = 300; // sikkerhetsnett hvis release() aldri kjører (krasj)

// Kalles fra API-laget inni next/server sin after() (bakgrunn, blokkerer ikke
// responsen — samme "dyrt kall skjer utenfor request-livssyklusen"-prinsipp
// som refreshNewsInBackground i lib/news.ts). Fyller GRADVIS (maks 2 om
// gangen per kall) i stedet for å prøve å fylle alle 10 synkront i én lang
// bakgrunnsjobb — hvert Sonnet+web_search-kall tar typisk 30-80 sekunder.
//
// Låst med incrWithExpiry: uten denne førte gjentatte GET-kall mot
// /api/ai-tips/stock (f.eks. SWR-revalidering mens lageret fortsatt fylles
// opp) til flere OVERLAPPENDE etterfyllinger som til sammen overskjøt målet
// på 10 — observert i praksis (endte på 12, senere verre: 23, unødvendig
// API-kostnad — se kostnadsrunden 2026-09-21).
// v2 (2026-09-21): lengden ble tidligere lest ÉN gang før løkken (`missing`/
// `toGenerate` regnet ut på forhånd) - alt low var lengden fortsatt stale hvis
// noe annet fikk skrevet til STOCK_HASH_KEY mens denne løkken kjørte (f.eks. en
// lockholder hvis TTL utløp midt i en treg generering, se STOCK_FILL_LOCK_TTL_SECONDS).
// Leser nå lengden PÅ NYTT før hver enkelt generering - et hardt, alltid ferskt
// tak på STOCK_TARGET uansett hva som forårsaket forrige overskyting.
export async function ensureStockFilled(): Promise<void> {
  const lockCount = await incrWithExpiry(STOCK_FILL_LOCK_KEY, STOCK_FILL_LOCK_TTL_SECONDS);
  if (lockCount > 1) return; // en annen fyller allerede opp
  try {
    for (let i = 0; i < 2; i++) {
      const current = await getStock();
      if (current.length >= STOCK_TARGET) break;
      await generateStockItem();
    }
  } finally {
    await del(STOCK_FILL_LOCK_KEY);
  }
}

// Fjerner ett lager-tips (Morten har "krysset det av") — etterfyllingen skjer
// separat via ensureStockFilled, kalt fra samme API-rute.
export async function completeStockItem(id: string): Promise<void> {
  await hdel(STOCK_HASH_KEY, id);
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

const MAX_MARK_LENGTH = 240;

function cleanMarkText(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_MARK_LENGTH);
}

// "Viktig" — gul markering. Ren personlig huking, aldri sett av AI-en igjen —
// derfor ingen kobling til profilen/promptene, bare lagring+visning.
export async function addHighlight(date: string, text: string): Promise<AiTip | null> {
  const raw = await hgetJSON<AiTip>(TIPS_HASH_KEY, date);
  if (!raw) return null;
  const tip = normalizeTip(raw);
  const clean = cleanMarkText(text);
  if (!clean) return tip;
  if (tip.highlights.includes(clean)) return tip;
  const nextTip: AiTip = { ...tip, highlights: [...tip.highlights, clean] };
  await hsetJSON(TIPS_HASH_KEY, date, nextTip);
  return nextTip;
}

export async function removeHighlight(date: string, text: string): Promise<AiTip | null> {
  const raw = await hgetJSON<AiTip>(TIPS_HASH_KEY, date);
  if (!raw) return null;
  const tip = normalizeTip(raw);
  const nextTip: AiTip = { ...tip, highlights: tip.highlights.filter((h) => h !== text) };
  await hsetJSON(TIPS_HASH_KEY, date, nextTip);
  return nextTip;
}

// Kort, direkte forklaring uten verktøy — dette er "forklar dette begrepet i
// kontekst", ikke research, så web_search hverken trengs eller er ønsket her
// (ville bare gjort svaret tregere og dyrere for en enkel begrepsforklaring).
async function explainConfusion(tip: AiTip, phrase: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: EXPLAIN_MODEL,
      max_tokens: 600,
      system: `Du forklarer et konkret ord/utsagn for Morten (se kontekst under) som han markerte fordi han ikke forsto det helt. Vurder selv hvor sentralt/nyttig det er for ham å forstå godt ut fra sammenhengen: er det en perifer detalj (navn, tall, sidespor), gi en kort presis forklaring på 1-2 setninger; er det et sentralt konsept for temaet eller direkte relevant for hans egne prosjekter (Fazile/NXT/Salesforce-arbeidet på jobb, eller mitt-dashboard/Mikke Mus/Boko Haramsdale privat), gi en dypere forklaring med et konkret eksempel. Svar med KUN selve forklaringsteksten — ingen JSON, ingen "Her er forklaringen:"-innledning, ingen anførselstegn rundt hele svaret.

${PERSONA_CONTEXT}`,
      messages: [
        {
          role: "user",
          content: `Dagens tips (kategori: ${tip.category}, tittel: "${tip.title}"):\n${tip.summary}\n\n${tip.details}\n\nForklar denne markerte teksten: "${phrase}"`,
        },
      ],
    });
    await recordUsage(response.usage);
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return raw || null;
  } catch (err) {
    console.error("AI-tips: forklaring feilet", err);
    return null;
  }
}

// "Forstår ikke" — trigger en on-demand Claude-forklaring MED ÉN GANG
// (marker-handlingen ER den eksplisitte "jeg vil ha dette forklart"-
// forespørselen, samme prinsipp som enrichNewsItem i lib/news.ts: dyrt kall
// skjer kun idet brukeren faktisk ber om det). Flagges også som et
// kunnskapshull i profilen, presist på frase-nivå.
export async function addConfusion(date: string, text: string): Promise<AiTip | null> {
  const raw = await hgetJSON<AiTip>(TIPS_HASH_KEY, date);
  if (!raw) return null;
  const tip = normalizeTip(raw);
  const clean = cleanMarkText(text);
  if (!clean) return tip;
  if (tip.confusions.some((c) => c.text === clean)) return tip;

  const explanation = await explainConfusion(tip, clean);
  const nextTip: AiTip = {
    ...tip,
    confusions: [...tip.confusions, { text: clean, explanation: explanation ?? undefined, explainedAt: explanation ? new Date().toISOString() : undefined }],
  };
  await hsetJSON(TIPS_HASH_KEY, date, nextTip);

  const profile = await getProfile();
  await saveProfile({
    ...profile,
    knownGaps: [...profile.knownGaps, { category: tip.category, topic: clean, date }].slice(-15),
    updatedAt: new Date().toISOString(),
  });

  return nextTip;
}

export async function removeConfusion(date: string, text: string): Promise<AiTip | null> {
  const raw = await hgetJSON<AiTip>(TIPS_HASH_KEY, date);
  if (!raw) return null;
  const tip = normalizeTip(raw);
  const nextTip: AiTip = { ...tip, confusions: tip.confusions.filter((c) => c.text !== text) };
  await hsetJSON(TIPS_HASH_KEY, date, nextTip);
  return nextTip;
}

export async function getArchive(limit = 60): Promise<AiTip[]> {
  const all = await hgetallJSON<AiTip>(TIPS_HASH_KEY);
  return Object.values(all)
    .map(normalizeTip)
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

// Delt mellom Dagens (submitFeedback) og Lager (submitStockFeedback) — samme
// beregningslogikk, men parametrisert på Redis-nøkler slik at hver skriver
// til SIN EGEN tips-hash og SIN EGEN profil. Lager-tilbakemelding skal ha
// effekt — den skal bare aldri lekke inn i Dagens' profil, og motsatt.
async function applyFeedback(
  tipHashKey: string,
  profileHashKey: string,
  date: string,
  input: AiTipFeedbackInput,
): Promise<AiTip | null> {
  const raw = await hgetJSON<AiTip>(tipHashKey, date);
  if (!raw) return null;
  const tip = normalizeTip(raw);

  const priorKnowledge = Math.max(1, Math.min(10, Math.round(input.priorKnowledge)));
  const understanding = Math.max(1, Math.min(10, Math.round(input.understanding)));
  const interest = Math.max(1, Math.min(10, Math.round(input.interest)));
  const formatFit = Math.max(1, Math.min(10, Math.round(input.formatFit)));
  const validTopics = new Set(tip.subtopics);
  const difficultTopics = input.difficultTopics.filter((t) => validTopics.has(t));
  const wantMoreTopics = input.wantMoreTopics.filter((t) => validTopics.has(t));
  const difficultNote = input.difficultNote?.trim() || undefined;
  const improvementNote = input.improvementNote?.trim() || undefined;

  const feedback: AiTipFeedback = {
    priorKnowledge,
    understanding,
    interest,
    formatFit,
    difficultTopics,
    difficultNote,
    wantMoreTopics,
    improvementNote,
    ratedAt: new Date().toISOString(),
  };
  const nextTip: AiTip = { ...tip, feedback };
  await hsetJSON(tipHashKey, date, nextTip);

  const profile = await loadProfile(profileHashKey);
  const nextLevel = clampLevel(profile.categoryLevels[tip.category] + computeLevelDelta(priorKnowledge, understanding));
  // Glidende gjennomsnitt (ikke bare siste verdi) — én enkeltdag med lav/høy
  // interesse skal ikke swinge vektingen voldsomt.
  const nextInterest = Math.round((profile.categoryInterest[tip.category] * 0.7 + interest * 0.3) * 10) / 10;
  const nextFormatFit = Math.round((profile.formatFitAvg * 0.6 + formatFit * 0.4) * 10) / 10;
  const newGaps = difficultTopics.map((topic) => ({ category: tip.category, topic, date }));
  const newWantsMore = wantMoreTopics.map((topic) => ({ category: tip.category, topic, date }));
  const newImprovementNotes = improvementNote ? [{ category: tip.category, topic: tip.title, note: improvementNote, date }] : [];

  await persistProfile(profileHashKey, {
    ...profile,
    categoryLevels: { ...profile.categoryLevels, [tip.category]: nextLevel },
    categoryInterest: { ...profile.categoryInterest, [tip.category]: nextInterest },
    formatFitAvg: nextFormatFit,
    knownGaps: [...profile.knownGaps, ...newGaps].slice(-15),
    wantsMore: [...profile.wantsMore, ...newWantsMore].slice(-15),
    improvementNotes: [...profile.improvementNotes, ...newImprovementNotes].slice(-15),
    updatedAt: new Date().toISOString(),
  });

  return nextTip;
}

export async function submitFeedback(date: string, input: AiTipFeedbackInput): Promise<AiTip | null> {
  return applyFeedback(TIPS_HASH_KEY, PROFILE_HASH_KEY, date, input);
}

// Samme skjema/beregning som Dagens, men leser/skriver Lagers EGEN profil
// (STOCK_PROFILE_HASH_KEY) — se kommentaren over Lager-seksjonen lenger opp.
export async function submitStockFeedback(id: string, input: AiTipFeedbackInput): Promise<AiTip | null> {
  return applyFeedback(STOCK_HASH_KEY, STOCK_PROFILE_HASH_KEY, id, input);
}
