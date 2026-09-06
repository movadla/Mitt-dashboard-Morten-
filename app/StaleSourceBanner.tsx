"use client";

import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
import { jsonFetcher } from "@/lib/swrFetcher";
import { timeAgo } from "@/lib/timeAgo";

interface DataSource {
  id: string;
  label: string;
  lastModified: string | null;
}

// Hvor gammel en kilde får bli før den regnes som utdatert. Satt per kilde,
// ikke som én felles grense: Oppgaver hentes i praksis flere ganger i uka,
// mens oppslagsverket om Mustad er nesten statisk. Én felles 30-dagersgrense
// (som Datakilder-kortet bruker) er derfor for slapp for de ferske kildene —
// "Oppgaver oppdatert for 25 dager siden" passerte den uten et pip, og sto
// bare som grå småtekst under "I dag".
const MAX_AGE_DAYS: Record<string, number> = {
  tasks: 7,
  widgets: 14,
  incomeForecast: 14,
  companyNews: 30,
  tenants: 45,
  companyInfo: 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function sourceAgeDays(lastModified: string | null): number | null {
  if (!lastModified) return null;
  const t = Date.parse(lastModified);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / DAY_MS;
}

/** Varsel over kortet når dataene seksjonen viser er eldre enn de burde være.
 *
 *  Rendrer ingenting når kilden er fersk, ukjent eller ikke har noen fil på
 *  disk. Det siste skjer med vilje i produksjonsbygg: `.local.ts`-filene
 *  følger aldri med dit (se .gitignore og ANONYMISERING.md), så `lastModified`
 *  er null der. Da er et varsel meningsløst — og et FALSKT varsel ville vært
 *  verre enn ingen, siden hele poenget er at du skal kunne stole på det. */
export default function StaleSourceBanner({ sourceId }: { sourceId?: string }) {
  // Samme SWR-nøkkel som Datakilder-kortet, så de deler ett nettverkskall.
  const { data } = useSWR<{ sources: DataSource[] }>(sourceId ? "/api/data-sources" : null, jsonFetcher);
  if (!sourceId) return null;

  const source = data?.sources.find((s) => s.id === sourceId);
  if (!source) return null;

  const ageDays = sourceAgeDays(source.lastModified);
  const limit = MAX_AGE_DAYS[sourceId];
  if (ageDays === null || limit === undefined || ageDays <= limit) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-status-warning/35 bg-status-warning/[0.08] px-3 py-2"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />
      <p className="min-w-0 text-2xs leading-snug text-ink-2">
        <span className="font-semibold text-status-warning">
          Tallene er {timeAgo(Date.parse(source.lastModified as string))}.
        </span>{" "}
        {source.label} er ikke oppdatert siden da — les dem som historikk, ikke som dagens tall.
      </p>
    </div>
  );
}
