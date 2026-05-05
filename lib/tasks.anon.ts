// Anonymisert mock-data – sjekkes inn i git og pushes til GitHub.
// Ekte Mustad-data ligger i lib/tasks.local.ts (gitignored).
// For å bytte til ekte data lokalt: endre re-eksporten i lib/tasks.ts.

export type Source = "salesforce" | "asana" | "outlook" | "teams";

export type SalesforceCategory = "mine" | "new" | "pending";

export type CaseTopic =
  | "missing-invoice"
  | "double-billed"
  | "missing-po"
  | "credit-note"
  | "common-costs"
  | "balance-statement"
  | "collections"
  | "guarantee-deposit"
  | "other";

export type Priority = "high" | "medium" | "low";

export type AmestoEmail = {
  subject: string;
  body: string;
};

export type CaseDetails = {
  kunde?: string;
  kontoType?: string;
  kontaktperson?: string;
  bygg?: string;
  byggInherited?: boolean;
  kontoeier?: string;
  hovedkontrakt?: string;
  note?: string;
};

export type Task = {
  id: string;
  source: Source;
  title: string;
  context?: string;
  dueAt?: string;
  externalUrl: string;
  category?: SalesforceCategory;
  summary?: string;
  topic?: CaseTopic;
  priority?: Priority;
  amestoEmail?: AmestoEmail;
  details?: CaseDetails;
};

export const SOURCE_META: Record<
  Source,
  { label: string; dot: string; chip: string }
> = {
  salesforce: {
    label: "Salesforce",
    dot: "bg-sky-400",
    chip: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  },
  asana: {
    label: "Asana",
    dot: "bg-pink-400",
    chip: "bg-pink-500/15 text-pink-300 ring-pink-500/30",
  },
  outlook: {
    label: "Outlook",
    dot: "bg-cyan-400",
    chip: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  teams: {
    label: "Teams",
    dot: "bg-violet-400",
    chip: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
};

export const SF_CATEGORY_META: Record<SalesforceCategory, { label: string }> = {
  mine: { label: "Mine" },
  new: { label: "Nye" },
  pending: { label: "Avventende" },
};

export const TOPIC_META: Record<CaseTopic, { label: string }> = {
  "missing-invoice": { label: "Manglende faktura" },
  "double-billed": { label: "Dobbelfakturert" },
  "missing-po": { label: "Mangler PO/ref" },
  "credit-note": { label: "Kreditnota" },
  "common-costs": { label: "Felleskost / energi" },
  "balance-statement": { label: "Saldo / regnskap" },
  collections: { label: "Inkasso" },
  "guarantee-deposit": { label: "Garanti / depositum" },
  other: { label: "Annet" },
};

export const TOPIC_ORDER: CaseTopic[] = [
  "guarantee-deposit",
  "collections",
  "credit-note",
  "double-billed",
  "missing-invoice",
  "missing-po",
  "common-costs",
  "balance-statement",
  "other",
];

export const PRIORITY_META: Record<
  Priority,
  { label: string; dot: string; rank: number }
> = {
  high: { label: "Høy", dot: "bg-rose-500", rank: 0 },
  medium: { label: "Middels", dot: "bg-amber-400", rank: 1 },
  low: { label: "Lav", dot: "bg-emerald-500", rank: 2 },
};

// I anon-versjonen brukes en eksempel-adresse.
export const AMESTO_RECIPIENT = "test@example.com";

const SF_BASE = "https://yourorg.lightning.force.com/lightning/r/Case/";
const sfUrl = (id: string) => `${SF_BASE}${id}/view`;

export const MOCK_TASKS: Task[] = [
  // ── Salesforce: Mine ───────────────────────────────────────────────────
  {
    id: "anon-mine-1",
    source: "salesforce",
    category: "mine",
    topic: "credit-note",
    priority: "medium",
    title: "Mangler kreditnota – faktura 12345",
    context: "00100001 · Avventer kunde · Acme Bil AS",
    externalUrl: sfUrl("anon-mine-1"),
    details: {
      kunde: "Acme Bil AS · Kundenr 30000",
      kontoType: "Kunde",
      bygg: "Eksempelveien 1",
      kontoeier: "Demo Selger",
      hovedkontrakt: "00000001 · t.o.m. 31.12.2030",
    },
    summary:
      "Kunden lurer på om en kreditnota mangler for en betalt faktura. Trenger bekreftelse fra regnskap.",
    amestoEmail: {
      subject: "Sak 00100001 – Acme Bil AS – Mangler kreditnota?",
      body:
        "Hei,\n\n" +
        "Jeg har fått inn sak 00100001 fra Acme Bil AS. Kunden lurer på om en kreditnota mangler for en betalt faktura.\n\n" +
        "Kan dere sjekke status og bekrefte om det stemmer?\n\n" +
        "Mvh\nMorten",
    },
  },
  {
    id: "anon-mine-2",
    source: "salesforce",
    category: "mine",
    topic: "missing-invoice",
    priority: "low",
    title: "Spørsmål om månedlig fakturering",
    context: "00100002 · Ny · Demokunde 1",
    externalUrl: sfUrl("anon-mine-2"),
    details: {
      kunde: "Demokunde 1 · Kundenr 20001",
      kontoType: "Kunde",
      kontaktperson: "Ola Nordmann · ola@example.com",
      bygg: "Eksempelveien 5",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000002 · t.o.m. 31.05.2027",
    },
    summary:
      "Kunden ønsker å vite hvordan månedsleien faktureres fremover.",
    amestoEmail: {
      subject: "Sak 00100002 – Demokunde 1 – Månedlig fakturering",
      body:
        "Hei,\n\n" +
        "Sak 00100002 fra Demokunde 1. Kan dere bekrefte gjeldende rutine for månedsleie?\n\n" +
        "Mvh\nMorten",
    },
  },

  // ── Salesforce: Nye ────────────────────────────────────────────────────
  {
    id: "anon-new-1",
    source: "salesforce",
    category: "new",
    topic: "double-billed",
    priority: "medium",
    title: "Dobbelfakturert kantinebidrag",
    context: "00100003 · Ny · Eksempel AS",
    externalUrl: sfUrl("anon-new-1"),
    details: {
      kunde: "Eksempel AS · Kundenr 11111",
      kontoType: "Kunde",
      bygg: "Demoveien 2",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000003 · t.o.m. 30.06.2029",
    },
    summary:
      "Kunden er fakturert kantinebidrag to ganger – ber om sjekk.",
    amestoEmail: {
      subject: "Sak 00100003 – Eksempel AS – Dobbelfakturert kantinebidrag",
      body:
        "Hei,\n\n" +
        "Sak 00100003 fra Eksempel AS – kantinebidrag fakturert dobbelt. Kan dere se på det?\n\n" +
        "Mvh\nMorten",
    },
  },
  {
    id: "anon-new-2",
    source: "salesforce",
    category: "new",
    topic: "credit-note",
    priority: "high",
    title: "Kreditnotaer sendt til feil mottaker",
    context: "00100004 · Ny · Test Bedrift AS",
    externalUrl: sfUrl("anon-new-2"),
    details: {
      kunde: "Test Bedrift AS · Kundenr 22222",
      kontoType: "Kunde, Leverandør",
      bygg: "Demoveien 4",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000004 · ingen sluttdato registrert",
    },
    summary:
      "To større kreditnotaer ser ut til å være sendt til feil selskap.",
    amestoEmail: {
      subject: "Sak 00100004 – Test Bedrift AS – Kreditnotaer feil mottaker",
      body:
        "Hei,\n\n" +
        "Sak 00100004 – kan dere sjekke status på kreditnotaene som er sendt?\n\n" +
        "Mvh\nMorten",
    },
  },

  // ── Salesforce: Avventende ─────────────────────────────────────────────
  {
    id: "anon-pending-1",
    source: "salesforce",
    category: "pending",
    topic: "missing-invoice",
    priority: "medium",
    title: "Mangler faktura for inneværende mnd",
    context: "00100005 · Avventer kunde · Sample Co AS",
    externalUrl: sfUrl("anon-pending-1"),
    details: {
      kunde: "Sample Co AS · Kundenr 33333",
      kontoType: "Kunde",
      bygg: "Demoveien 6",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000005 · t.o.m. 31.12.2028",
    },
    summary: "Kunden venter på faktura som ennå ikke er mottatt.",
    amestoEmail: {
      subject: "Sak 00100005 – Sample Co AS – Mangler faktura",
      body:
        "Hei,\n\nSak 00100005 – kunden venter på faktura. Status?\n\nMvh\nMorten",
    },
  },
  {
    id: "anon-pending-2",
    source: "salesforce",
    category: "pending",
    topic: "missing-po",
    priority: "medium",
    title: "Faktura mangler prosjektnummer",
    context: "00100006 · Avventer kunde · Demokunde 2",
    externalUrl: sfUrl("anon-pending-2"),
    details: {
      kunde: "Demokunde 2 · Kundenr 44444",
      kontoType: "Kunde",
      bygg: "Demoveien 8",
      byggInherited: true,
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000006 · utløper 30.06.2026",
      note: "Hovedkontrakt utløper snart – sjekk reforhandling.",
    },
    summary:
      "Kunden kan ikke ta imot faktura uten prosjektnummer. Må korrigeres.",
  },
  {
    id: "anon-pending-3",
    source: "salesforce",
    category: "pending",
    topic: "double-billed",
    priority: "medium",
    title: "Trippelfakturert parkering",
    context: "00100007 · Iverksettes · Mock Bedrift AS",
    externalUrl: sfUrl("anon-pending-3"),
    details: {
      kunde: "Mock Bedrift AS · Kundenr 55555",
      kontoType: "Kunde",
      bygg: "Demoveien 10",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000007 · t.o.m. 30.09.2029",
    },
    summary:
      "Kunden har mottatt 3 fakturaer for samme parkeringsplass.",
  },
  {
    id: "anon-pending-4",
    source: "salesforce",
    category: "pending",
    topic: "common-costs",
    priority: "low",
    title: "Prisendring uten varsel",
    context: "00100008 · Avventer kunde · Eksempelkunde",
    externalUrl: sfUrl("anon-pending-4"),
    details: {
      kunde: "Eksempelkunde · Kundenr 66666",
      kontoType: "Kunde",
      bygg: "Demoveien 12",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000008 · t.o.m. 31.03.2028",
    },
    summary:
      "Kunden påpeker prisendring i mai uten varsel.",
  },
  {
    id: "anon-pending-5",
    source: "salesforce",
    category: "pending",
    topic: "guarantee-deposit",
    priority: "high",
    title: "Bankgaranti mangler",
    context: "00100009 · Avventer kunde · Demokunde 3",
    externalUrl: sfUrl("anon-pending-5"),
    details: {
      kunde: "Demokunde 3 · Kundenr 77777",
      kontoType: "Kunde",
      bygg: "Demoveien 14",
      kontoeier: "Demo KAM",
      hovedkontrakt: "00000009 · t.o.m. 31.12.2032",
    },
    summary:
      "Iht. leiekontrakt skal kunden stille bankgaranti. Frist nærmer seg.",
  },

  // ── Asana ──────────────────────────────────────────────────────────────
  {
    id: "as-1",
    source: "asana",
    title: "Skriv brief for nytt nettsted",
    context: "Marked · Q2 2026",
    dueAt: "2026-05-07",
    externalUrl: "https://app.asana.com/0/123/456",
  },
  {
    id: "as-2",
    source: "asana",
    title: "Review utkast til årsrapport",
    context: "Ledelse",
    dueAt: "2026-05-05",
    externalUrl: "https://app.asana.com/0/123/789",
  },
  {
    id: "as-3",
    source: "asana",
    title: "Bestille møterom for kickoff",
    context: "Adm",
    externalUrl: "https://app.asana.com/0/123/321",
  },

  // ── Outlook ────────────────────────────────────────────────────────────
  {
    id: "ol-1",
    source: "outlook",
    title: "Svar: leiekontrakt vedlegg B",
    context: "Fra: advokat@firma.no",
    dueAt: "2026-05-05",
    externalUrl: "https://outlook.office.com/mail/inbox/id/AAQk",
  },
  {
    id: "ol-2",
    source: "outlook",
    title: "Bekreft møte med styret",
    context: "Fra: styreleder@example.com",
    dueAt: "2026-05-06",
    externalUrl: "https://outlook.office.com/mail/inbox/id/AAQk2",
  },

  // ── Teams ──────────────────────────────────────────────────────────────
  {
    id: "tm-1",
    source: "teams",
    title: "Svare i tråd: budsjett 2026",
    context: "Kanal: Økonomi",
    externalUrl: "https://teams.microsoft.com/l/message/19:abc/123",
  },
  {
    id: "tm-2",
    source: "teams",
    title: "@Morten – kan du se på dette?",
    context: "DM: Per Hansen",
    dueAt: "2026-05-05",
    externalUrl: "https://teams.microsoft.com/l/message/19:def/456",
  },
];

export async function getTasks(): Promise<Task[]> {
  return MOCK_TASKS;
}
