import { useEffect, useState } from "react";
import type { SetIntensity, SetLog, WorkoutEntry, WorkoutSession } from "@/lib/workouts";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";

export const INTENSITY_LABEL: Record<SetIntensity, string> = { lav: "Lav", middels: "Middels", hoy: "Høy" };

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Tikkende klokke for den pågående økten — teller opp fra startedAt til økten avsluttes.
export function useElapsed(startedAt: string | undefined): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      // Date.now()-baserte klokke kan ikke avledes i render (render må være
      // rent) — hele denne synkroniseringen må derfor skje i en effekt.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    setElapsed(Date.now() - start);
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

// Enkel nedtellings-hviletidtaker mellom sett — samme "Date.now() kan ikke
// avledes i render"-mønster som useElapsed over. Kun aktiv når `endsAt` er
// satt, så vi unngår en 1x/sekund re-render av hele seksjonen når man ikke
// hviler mellom sett.
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (endsAt === null) return;
    function tick() {
      const rest = endsAt! - Date.now();
      if (rest <= 0) {
        setRemainingMs(0);
        setEndsAt(null);
        vibrate([15, 40, 15]);
        return;
      }
      setRemainingMs(rest);
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  return {
    active: endsAt !== null,
    remainingMs,
    start: (seconds: number) => setEndsAt(Date.now() + seconds * 1000),
    adjust: (deltaSeconds: number) => setEndsAt((prev) => (prev === null ? null : Math.max(Date.now(), prev + deltaSeconds * 1000))),
    stop: () => setEndsAt(null),
  };
}

export function formatRest(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

// { year, month } (month 0-indeksert) for "dagens måned + offset" —
// localDateString() gir dagens Oslo-kalenderdag som fast utgangspunkt,
// samme mønster som `today = localDateString()` brukt direkte i render
// andre steder i appen (TodaySummary, EventsSection m.fl.).
export function calendarMonthFromOffset(offset: number): { year: number; month: number } {
  const [y, m] = localDateString().split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + offset, 1));
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() };
}

// 6×7-rutenett med "YYYY-MM-DD"-strenger, mandag først — inkluderer
// utfyllende dager fra forrige/neste måned slik at rutenettet alltid blir
// helt fylt. Ren UTC-kalenderaritmetikk (samme mønster som addDaysIso i
// lib/payday.ts) — uavhengig av nettleserens lokale tidssone.
export function calendarMonthDays(year: number, month: number): string[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // 0 = mandag
  const start = new Date(Date.UTC(year, month, 1 - firstWeekday));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function formatMonthLabel(year: number, month: number): string {
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatKg(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1).replace(/\.0$/, "");
}

// Runder til nærmeste 0,5 kg (vanligste plate-inkrement) for å unngå
// flyttall-artefakter når +/- stepperne justerer vekten.
export function roundKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

// Varighet lagres fortsatt som (desimale) minutter i SetLog/WorkoutEntry —
// 1:25 blir 1,4167 — så gamle heltallsverdier og API-et er uendret. Kun
// inn-/utlesing i UI kjenner til minutt:sekund-formen.

// Godtar "1:25", "12", "12,5", "12.5" og ":45". Runder til nærmeste sekund.
export function parseDuration(input: string): number | null {
  const raw = input.trim().replace(",", ".");
  if (!raw) return null;
  const colon = raw.match(/^(\d*):(\d{1,2})$/);
  if (colon) {
    const mins = colon[1] ? Number(colon[1]) : 0;
    const secs = Number(colon[2]);
    if (secs >= 60) return null;
    return mins + secs / 60;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 60) / 60;
}

// "1:25" for brøkminutter, "12:00" for hele — samme form i begge tilfeller,
// slik at tallet i et sett-felt alltid leses som tid, ikke som et antall.
export function formatDuration(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Kompakt etikett for sammendrag/historikk: hele minutter som "45 min",
// alt annet som "1:25" — "45:00" i en tekstlinje er bare støy.
export function formatDurationLabel(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} min`;
  return formatDuration(minutes);
}

export function formatSetLog(s: SetLog): string | null {
  const parts: string[] = [];
  if (s.kg != null && s.reps != null) parts.push(`${formatKg(s.kg)}kg×${s.reps}`);
  else if (s.kg != null) parts.push(`${formatKg(s.kg)}kg`);
  else if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.minutes != null) parts.push(formatDurationLabel(s.minutes));
  if (s.distanceKm != null) parts.push(`${formatKg(s.distanceKm)} km`);
  if (s.kmt != null) parts.push(`${s.kmt} km/t`);
  if (s.intensity) parts.push(INTENSITY_LABEL[s.intensity]);
  return parts.join(" · ") || null;
}

// `limit` viser kun de siste N settene (mest relevante for en rask
// oversikt) i stedet for en stadig voksende tekstvegg for øvelser med
// mange sett historisk — prefikset "…" signaliserer at det finnes flere
// foran de viste.
export function setSummary(entry: WorkoutEntry, limit?: number): string {
  const formatted = entry.sets.map(formatSetLog).filter((s): s is string => !!s);
  if (!limit || formatted.length <= limit) return formatted.join(", ");
  return `…${formatted.slice(-limit).join(", ")}`;
}

// Finner siste avsluttede økt som inneholder samme øvelse — "sessions" er
// allerede sortert nyest-først (server-side i lib/workouts.ts), så første
// treff er det vi vil vise som "Sist: ...".
export function findLastEntry(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): WorkoutEntry | null {
  for (const s of sessions) {
    if (s.id === excludeSessionId || !s.endedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry) return entry;
  }
  return null;
}

export interface ExerciseHistoryPoint {
  date: string;
  maxKg: number;
  // Reps totalt (summen av alle sett) samme økt — vist som en egen linje i
  // ProgressChart ved siden av vekten, jf. ønske om å se progresjon i BÅDE
  // kg og antall, ikke bare vekt alene (man kan øke volum uten å øke vekten,
  // eller omvendt).
  totalReps: number;
}

// Høyeste vekt OG totalt antall reps logget per avsluttet økt for en øvelse,
// kronologisk (eldst først) — "sessions" er nyest-først server-side, så vi
// snur rekkefølgen.
export function exerciseHistory(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): ExerciseHistoryPoint[] {
  const points: ExerciseHistoryPoint[] = [];
  for (const s of sessions) {
    if (s.id === excludeSessionId || !s.endedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) continue;
    const kgValues = entry.sets.map((set) => set.kg).filter((kg): kg is number => kg != null);
    if (kgValues.length === 0) continue;
    const totalReps = entry.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
    points.push({ date: s.startedAt, maxKg: Math.max(...kgValues), totalReps });
  }
  return points.reverse();
}

// Normaliserer én tallserie til chart-koordinater — kg og reps lever på helt
// ulike skalaer, så hver linje normaliseres uavhengig av den andre (egen
// min/maks), ikke på en delt akse.
export function chartCoords(values: number[], width: number, height: number, pad: number): { x: number; y: number }[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: pad + i * stepX,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }));
}
