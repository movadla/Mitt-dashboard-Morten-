"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, SkeletonRows } from "./CardShell";
import { timeAgo } from "@/lib/timeAgo";
import { Database } from "lucide-react";
import { MAX_AGE_DAYS, sourceAgeDays } from "./StaleSourceBanner";
import { RatioBar } from "./privat/DataStrips";

interface DataSource {
  id: string;
  label: string;
  lastModified: string | null;
}

// Samme per-kilde-grenser som ferskhetsvarselet over hvert kort (StaleSourceBanner) - én flat
// grense her lot tidligere denne oversikten og selve varselet være uenige om hva som er
// "utdatert" (Oppgaver sin 7-dagersgrense druknet i en felles 30-dagersgrense). Kilder uten
// egen oppføring (i dag ingen) faller tilbake til samme 30 dager som før.
const DEFAULT_MAX_AGE_DAYS = 30;

export default function JobbDataSourcesCard({
  // Kilde-id → seksjonen den hører til, men KUN der koblingen er entydig (se
  // JobbView). «widgets» mater fem seksjoner og «tasks» to, og da finnes det ikke
  // ett riktig sted å hoppe — de radene er derfor med vilje ikke klikkbare, og
  // mangelen på hover er signalet. (2026-09-08)
  sourceToSection,
  onJumpToSection,
}: {
  sourceToSection?: Record<string, string>;
  onJumpToSection?: (sectionId: string) => void;
}) {
  const { data, isLoading: loading } = useSWR<{ sources: DataSource[] }>("/api/data-sources", jsonFetcher);
  const sources = data?.sources ?? [];
  // Eldst/mest utdatert øverst — det er det man faktisk trenger å legge merke til.
  const sorted = [...sources].sort((a, b) => {
    if (a.lastModified === null) return -1;
    if (b.lastModified === null) return 1;
    return Date.parse(a.lastModified) - Date.parse(b.lastModified);
  });
  // Samme per-kilde-grense som brukes pr. rad under - ingen ny terskel oppfunnet her.
  const staleCount = sources.filter((s) => {
    const ageDays = sourceAgeDays(s.lastModified);
    const limit = MAX_AGE_DAYS[s.id] ?? DEFAULT_MAX_AGE_DAYS;
    return ageDays !== null && ageDays > limit;
  }).length;

  return (
    <div className="border-t-2 border-t-slate-400/60 p-4">
      <CardHeader
        title="Datakilder"
        subtitle="Når hver manuelt oppdaterte kilde sist ble oppdatert"
        // Kun vist når noe faktisk ER utdatert - et "0 utdaterte" ville sett ut som et
        // alarmtall selv om det egentlig betyr at alt er ferskt.
        stat={staleCount > 0 ? { value: staleCount, label: staleCount === 1 ? "utdatert kilde" : "utdaterte kilder" } : undefined}
        icon={Database}
        iconColorClass="text-slate-400"
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-3">
          Disse dataene oppdateres manuelt av Claude i egne research-runder (ikke live-integrert) — denne listen viser
          hvor lenge det er siden hver kilde faktisk ble oppdatert, så du vet om noe er ferskt eller bør oppdateres.
        </p>
        {/* RatioBar sitt `label` er kun aria-label, altså usynlig — stripen sto her som
            en rad umerkede segmenter uten noe som fortalte hva de talte. Teksten skrives
            nå ut under den. (2026-09-08) */}
        {sources.length > 0 && (
          <div>
            <RatioBar
              done={sources.length - staleCount}
              total={sources.length}
              colorClass="text-slate-400"
              label={`${sources.length - staleCount} av ${sources.length} kilder ferske`}
            />
            <p className="mt-1.5 text-2xs text-ink-3">
              {sources.length - staleCount} av {sources.length} kilder er ferske
            </p>
          </div>
        )}
        {loading ? (
          <SkeletonRows count={5} className="h-10" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.map((s) => {
              const ageDays = sourceAgeDays(s.lastModified);
              const limit = MAX_AGE_DAYS[s.id] ?? DEFAULT_MAX_AGE_DAYS;
              const isStale = ageDays !== null && ageDays > limit;
              const seksjon = sourceToSection?.[s.id];
              const kanHoppe = seksjon !== undefined && onJumpToSection !== undefined;
              const innhold = (
                <>
                  <span className="min-w-0 truncate text-sm text-ink-1">{s.label}</span>
                  <span
                    className={`shrink-0 text-2xs font-medium tabular-nums ${isStale ? "text-status-warning" : "text-ink-3"}`}
                    title={s.lastModified ? new Date(s.lastModified).toLocaleString("nb-NO") : "Ikke tilgjengelig"}
                  >
                    {s.lastModified ? timeAgo(Date.parse(s.lastModified)) : "Ikke tilgjengelig"}
                  </span>
                </>
              );
              const felles = "flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left";
              return kanHoppe ? (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onJumpToSection(seksjon)}
                  className={`${felles} transition hover:border-line-strong hover:bg-surface-3`}
                >
                  {innhold}
                </button>
              ) : (
                <div key={s.id} className={felles}>
                  {innhold}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
