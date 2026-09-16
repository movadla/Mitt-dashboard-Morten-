"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { SkeletonRows, useMutationError, MutationError } from "../../CardShell";
import type { RyggDailyLog, RyggProgramMeta, RyggSessionLog, RyggWeekState } from "@/lib/ryggLog";
import TodayTab from "./TodayTab";
import WeekTab from "./WeekTab";
import TrendTab from "./TrendTab";
import LogTab from "./LogTab";

type RyggView = "idag" | "uke" | "trend" | "logg";

const VIEWS: { id: RyggView; label: string }[] = [
  { id: "idag", label: "I dag" },
  { id: "uke", label: "Uke" },
  { id: "trend", label: "Trend" },
  { id: "logg", label: "Logg" },
];

export default function RyggSection() {
  const [view, setView] = useState<RyggView>("idag");
  const mutationError = useMutationError();

  const { data: weeksData, mutate: mutateWeeks, isLoading: loadingWeeks } = useSWR<{ weeks: RyggWeekState[]; meta: RyggProgramMeta }>(
    "/api/rygg/weeks",
    jsonFetcher,
  );
  const { data: dailyData, mutate: mutateDaily } = useSWR<{ logs: RyggDailyLog[] }>("/api/rygg/daily", jsonFetcher);
  const { data: sessionsData, mutate: mutateSessions } = useSWR<{ logs: RyggSessionLog[] }>("/api/rygg/sessions", jsonFetcher);
  const { data: disclaimerData, mutate: mutateDisclaimer } = useSWR<{ seenAt: string | null }>("/api/rygg/disclaimer", jsonFetcher);

  async function refreshAll() {
    await Promise.all([mutateWeeks(), mutateDaily(), mutateSessions()]);
    // Samme app-konvensjon som alle andre mutasjons-handlere i Privat:
    // PrivatPanel lytter og revaliderer ALLE SWR-nøkler — det er slik
    // Trening-badgen og "I dag"-kortets rygg-rad (/api/rygg/status) holdes
    // i takt uten at de trenger å kjenne til denne komponenten.
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function acknowledgeDisclaimer() {
    mutateDisclaimer({ seenAt: new Date().toISOString() }, { revalidate: false });
    try {
      await fetch("/api/rygg/disclaimer", { method: "POST" });
    } catch {
      /* ikke kritisk om skrivingen feiler — vises igjen neste gang, ingen datatap */
    }
  }

  const weeks = weeksData?.weeks ?? [];
  const meta = weeksData?.meta;
  const dailyLogs = dailyData?.logs ?? [];
  const sessionLogs = sessionsData?.logs ?? [];
  const currentWeekState = meta ? weeks.find((w) => w.week === meta.currentWeek) : undefined;

  const disclaimerSeen = disclaimerData?.seenAt != null;
  const disclaimerLoading = disclaimerData === undefined;

  if (loadingWeeks || disclaimerLoading) {
    return <SkeletonRows count={3} />;
  }

  if (!disclaimerSeen) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-status-warning/30 bg-status-warning/[0.06] p-3.5">
        <p className="text-sm text-ink-1">
          Dette er et selvlaget treningsopplegg, ikke medisinsk behandling. Programmet forutsetter korsryggsmerter
          uten utstråling. Vis det til fysioterapeuten din, og la hen overstyre det som bør overstyres.
        </p>
        <button
          type="button"
          onClick={acknowledgeDisclaimer}
          className="self-start rounded-lg bg-status-warning/15 px-3 py-1.5 text-2xs font-semibold uppercase text-status-warning transition hover:bg-status-warning/25"
        >
          Jeg forstår
        </button>
      </div>
    );
  }

  if (!meta || !currentWeekState) {
    return <p className="text-sm text-ink-3">Kunne ikke laste ryggprogrammet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <MutationError message={mutationError.message} />

      <div className="flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface-1 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={`rounded-md px-2.5 py-1 text-2xs font-semibold uppercase transition ${
              view === v.id ? "bg-emerald-400/15 text-emerald-400" : "text-ink-3 hover:text-ink-1"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "idag" && (
        <TodayTab
          meta={meta}
          weekState={currentWeekState}
          dailyLogs={dailyLogs}
          sessionLogs={sessionLogs}
          onChanged={refreshAll}
          onError={mutationError.show}
        />
      )}
      {view === "uke" && (
        <WeekTab
          meta={meta}
          weekState={currentWeekState}
          sessionLogs={sessionLogs}
          onChanged={refreshAll}
          onError={mutationError.show}
        />
      )}
      {view === "trend" && <TrendTab weeks={weeks} dailyLogs={dailyLogs} sessionLogs={sessionLogs} meta={meta} />}
      {view === "logg" && (
        <LogTab dailyLogs={dailyLogs} sessionLogs={sessionLogs} onChanged={refreshAll} onError={mutationError.show} />
      )}

      <div className="rounded-xl border border-line bg-surface-2 p-3 text-2xs leading-relaxed text-ink-3">
        <p className="mb-1 font-semibold uppercase tracking-wide text-ink-4">Faste regler</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Smerte opp til 3–4 av 10 under trening er greit, så lenge den roer seg innen et døgn.</li>
          <li>Utstråling, nummenhet eller prikking ned i setet eller beinet: avslutt øvelsen og kontakt fysio.</li>
          <li>Ikke bøy tungt den første timen etter oppvåkning.</li>
          <li>20–30 minutter gange daglig, uansett uke.</li>
          <li>Tre rolige økter slår fem harde. Effekten kommer av å holde ut i måneder.</li>
        </ul>
      </div>
    </div>
  );
}
