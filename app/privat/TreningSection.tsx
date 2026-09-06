"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import {
  CardHeader,
  CheckIcon,
  ConfirmDialog,
  MutationError,
  SkeletonRows,
  useConfirmDelete,
  useMutationError,
} from "../CardShell";
import type { Exercise, ExerciseCategory } from "@/lib/exercises";
import type { SetIntensity, SetLog, WorkoutEntry, WorkoutSession } from "@/lib/workouts";
import type { Routine } from "@/lib/routines";
import { vibrate } from "@/lib/haptics";
import { addDaysIso, localDateString, toOsloDateString, weekRangeContaining } from "@/lib/payday";
import { WeekStrip } from "./DataStrips";
import { Activity, ChevronLeft, ChevronRight, Dumbbell, GripVertical, Pencil, X } from "lucide-react";
import SwipeableRow from "./SwipeableRow";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const VISIBLE_HISTORY = 5;
const HISTORY_PAGE_SIZE = 5;

const EMPTY_SESSIONS: WorkoutSession[] = [];
const EMPTY_EXERCISES: Exercise[] = [];
const EMPTY_ROUTINES: Routine[] = [];

const CATEGORY_LABEL: Record<ExerciseCategory, string> = { styrke: "Styrke", cardio: "Cardio" };
const CATEGORY_ICON: Record<ExerciseCategory, typeof Dumbbell> = { styrke: Dumbbell, cardio: Activity };
// Styrke er bevisst nøytral (ikke emerald) — Trenings egen fane-farge OG
// "fullført"-tilstanden (status-positive) er begge grønne, så et grønt
// styrke-ikon druknet i de to andre grønnfargene og gjorde det umulig å se
// hvorfor en rad var grønn (kategori, eller ferdig?) i praksis. Selve
// ikon-formen (Dumbbell vs. Activity) bærer taksonomien, ikke fargen.
const CATEGORY_ACCENT: Record<ExerciseCategory, string> = { styrke: "text-ink-3", cardio: "text-sky-400" };
const INTENSITY_LABEL: Record<SetIntensity, string> = { lav: "Lav", middels: "Middels", hoy: "Høy" };
const INTENSITY_OPTIONS: SetIntensity[] = ["lav", "middels", "hoy"];

// Gjenbrukt "done"-avkrysning — samme visuelle mønster (fylt grønn sirkel med
// hake) som MilestoneRow i AlfredSection.tsx og ItemRow i ShoppingListSection.tsx.
function DoneToggle({
  done,
  onToggle,
  size = "md",
  label,
}: {
  done: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  label: string;
}) {
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={label}
      className={`grid ${dim} shrink-0 place-items-center rounded-full ring-1 transition ${
        done ? "bg-status-positive ring-status-positive" : "bg-transparent ring-line-strong hover:ring-line-strong"
      }`}
    >
      {done && <CheckIcon className="h-3.5 w-3.5 text-surface-0" />}
    </button>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Tikkende klokke for den pågående økten — teller opp fra startedAt til økten avsluttes.
function useElapsed(startedAt: string | undefined): number {
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

const DEFAULT_REST_SECONDS = 90;
const REST_ADJUST_SECONDS = 15;

// Enkel nedtellings-hviletidtaker mellom sett — samme "Date.now() kan ikke
// avledes i render"-mønster som useElapsed over. Kun aktiv når `endsAt` er
// satt, så vi unngår en 1x/sekund re-render av hele seksjonen når man ikke
// hviler mellom sett.
function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (endsAt === null) return;
    function tick() {
      const rest = endsAt! - Date.now();
      if (rest <= 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRemainingMs(0);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEndsAt(null);
        vibrate([15, 40, 15]);
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

function formatRest(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

// { year, month } (month 0-indeksert) for "dagens måned + offset" —
// localDateString() gir dagens Oslo-kalenderdag som fast utgangspunkt,
// samme mønster som `today = localDateString()` brukt direkte i render
// andre steder i appen (TodaySummary, EventsSection m.fl.).
function calendarMonthFromOffset(offset: number): { year: number; month: number } {
  const [y, m] = localDateString().split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + offset, 1));
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() };
}

// 6×7-rutenett med "YYYY-MM-DD"-strenger, mandag først — inkluderer
// utfyllende dager fra forrige/neste måned slik at rutenettet alltid blir
// helt fylt. Ren UTC-kalenderaritmetikk (samme mønster som addDaysIso i
// lib/payday.ts) — uavhengig av nettleserens lokale tidssone.
function calendarMonthDays(year: number, month: number): string[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // 0 = mandag
  const start = new Date(Date.UTC(year, month, 1 - firstWeekday));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function formatMonthLabel(year: number, month: number): string {
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const WEEKDAY_LABELS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

function formatKg(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1).replace(/\.0$/, "");
}

// Runder til nærmeste 0,5 kg (vanligste plate-inkrement) for å unngå
// flyttall-artefakter når +/- stepperne justerer vekten.
function roundKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

function formatSetLog(s: SetLog): string | null {
  const parts: string[] = [];
  if (s.kg != null && s.reps != null) parts.push(`${formatKg(s.kg)}kg×${s.reps}`);
  else if (s.kg != null) parts.push(`${formatKg(s.kg)}kg`);
  else if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.minutes != null) parts.push(`${s.minutes} min`);
  if (s.distanceKm != null) parts.push(`${formatKg(s.distanceKm)} km`);
  if (s.kmt != null) parts.push(`${s.kmt} km/t`);
  if (s.intensity) parts.push(INTENSITY_LABEL[s.intensity]);
  return parts.join(" · ") || null;
}

// `limit` viser kun de siste N settene (mest relevante for en rask
// oversikt) i stedet for en stadig voksende tekstvegg for øvelser med
// mange sett historisk — prefikset "…" signaliserer at det finnes flere
// foran de viste.
function setSummary(entry: WorkoutEntry, limit?: number): string {
  const formatted = entry.sets.map(formatSetLog).filter((s): s is string => !!s);
  if (!limit || formatted.length <= limit) return formatted.join(", ");
  return `…${formatted.slice(-limit).join(", ")}`;
}

// Finner siste avsluttede økt som inneholder samme øvelse — "sessions" er
// allerede sortert nyest-først (server-side i lib/workouts.ts), så første
// treff er det vi vil vise som "Sist: ...".
function findLastEntry(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): WorkoutEntry | null {
  for (const s of sessions) {
    if (s.id === excludeSessionId || !s.endedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry) return entry;
  }
  return null;
}

interface ExerciseHistoryPoint {
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
function exerciseHistory(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): ExerciseHistoryPoint[] {
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
function chartCoords(values: number[], width: number, height: number, pad: number): { x: number; y: number }[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: pad + i * stepX,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }));
}

// Enkel innebygd SVG-linjegraf — ingen chart-bibliotek i prosjektet, og en
// håndfull punkter (typisk et titalls økter) trenger ikke noe tyngre enn dette.
// To linjer (vekt + totalt antall reps), hver normalisert til egen skala —
// se chartCoords.
function ProgressChart({ points }: { points: ExerciseHistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="text-2xs text-ink-4">Ikke nok data ennå for graf.</p>;
  }

  const width = 260;
  const height = 64;
  const pad = 6;
  const kgValues = points.map((p) => p.maxKg);
  const repValues = points.map((p) => p.totalReps);
  const kgCoords = chartCoords(kgValues, width, height, pad);
  const repCoords = chartCoords(repValues, width, height, pad);

  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Rå farger, ikke status-positive/status-action — de er reservert
            ekte suksess-/handlings-tilstander andre steder i appen (se
            SportSection.tsx). Reps-linjen er stiplet i tillegg til å ha
            egen farge, så de to seriene skiller seg selv i gråtoner. */}
        <polyline
          points={kgCoords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          className="text-emerald-400"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {kgCoords.map((c, i) => (
          <circle key={`kg-${i}`} cx={c.x} cy={c.y} r="2.5" className="text-emerald-400" fill="currentColor" />
        ))}
        <polyline
          points={repCoords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          className="text-sky-400"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {repCoords.map((c, i) => (
          <circle key={`reps-${i}`} cx={c.x} cy={c.y} r="2" className="text-sky-400" fill="currentColor" />
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-4">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          {formatKg(Math.min(...kgValues))}–{formatKg(Math.max(...kgValues))} kg
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          {Math.min(...repValues)}–{Math.max(...repValues)} reps totalt
        </span>
        <span>siste {points.length} {points.length === 1 ? "økt" : "økter"}</span>
      </div>
    </div>
  );
}

// Kg/reps lagres lokalt til feltet mister fokus (samme mønster som andre
// inline-redigerbare felt i appen) — unngår at hver tastetrykk sender en
// egen nettverksforespørsel.
// Liten +/- knapp brukt av kg/reps-stepperne under.
function StepperButton({ symbol, label, onClick }: { symbol: "+" | "−"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-1 text-sm text-ink-2 transition hover:border-line-strong hover:bg-surface-3 hover:text-ink-1 active:scale-95"
    >
      {symbol}
    </button>
  );
}

// bg-surface-2 (ett hakk lysere enn EntryRow sin surface-1) — settraden skal
// alternere tydelig fra øvelse-nivået rundt, i stedet for å dele bakgrunn med
// den (tidligere: begge surface-1, så settet "forsvant" inn i øvelsen).
// Ingen egen border her lenger — tone+avstand alene skiller radene, samme
// prinsipp som Strong/Hevy bruker for tette sett-lister.
function SetRowShell({
  index,
  done,
  previousLabel,
  pr = false,
  onToggleDone,
  onRemove,
  children,
}: {
  index: number;
  done: boolean;
  previousLabel?: string;
  // Satt når vekten i dette settet slår alt tidligere logget på øvelsen —
  // en liten motiverende markør, ikke noe som lagres på settet selv.
  pr?: boolean;
  onToggleDone: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <SwipeableRow onSwipeLeft={onRemove} leftLabel="Slett">
      <div
        className={`flex flex-col gap-1.5 rounded-xl px-2 py-2 transition ${
          done ? "bg-status-positive/10" : "bg-surface-2"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <DoneToggle done={done} onToggle={onToggleDone} size="sm" label={done ? "Merk sett som ikke fullført" : "Merk sett som fullført"} />
            <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-4">Sett {index + 1}</span>
            {pr && (
              <span className="shrink-0 rounded-full bg-status-positive/15 px-1.5 py-0.5 text-2xs font-semibold uppercase text-status-positive">
                PR
              </span>
            )}
            {/* "Spøkelses"-verdi fra forrige gang samme sett-indeks ble logget
                — gir progresjon sett-for-sett, ikke bare et sammendrag øverst
                i øvelsen. */}
            {previousLabel && <span className="truncate text-2xs text-ink-4">Sist: {previousLabel}</span>}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Slett sett"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </SwipeableRow>
  );
}

function StrengthSetRow({
  set,
  index,
  previousLabel,
  bodyweight = false,
  bestEverKg = 0,
  onUpdate,
  onToggleDone,
  onRemove,
}: {
  set: SetLog;
  index: number;
  previousLabel?: string;
  bodyweight?: boolean;
  // Høyeste vekt noensinne logget på denne øvelsen (på tvers av ALLE
  // tidligere økter, ikke bare forrige) — brukt til å avgjøre om dette
  // settet er en ny personlig rekord.
  bestEverKg?: number;
  onUpdate: (updates: { kg: number | null; reps: number | null }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}) {
  const [kg, setKg] = useState(set.kg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const kgNum = kg.trim() ? Number(kg) : null;
  const isPr = !bodyweight && kgNum != null && kgNum > bestEverKg;

  function commit(nextKg: string, nextReps: string) {
    onUpdate({
      kg: nextKg.trim() ? Number(nextKg) : null,
      reps: nextReps.trim() ? Number(nextReps) : null,
    });
  }

  // Knappe-trykk er en diskret handling og committer umiddelbart — i
  // motsetning til fritekst-inntasting i feltene, som fortsatt committer på
  // blur (unngår ett nettverkskall per tastetrykk der).
  function adjustKg(delta: number) {
    vibrate(6);
    const current = kg.trim() ? Number(kg) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setKg(nextStr);
    commit(nextStr, reps);
  }

  function adjustReps(delta: number) {
    vibrate(6);
    const current = reps.trim() ? Number(reps) : 0;
    const next = Math.max(0, current + delta);
    const nextStr = String(next);
    setReps(nextStr);
    commit(kg, nextStr);
  }

  return (
    <SetRowShell index={index} done={!!set.done} previousLabel={previousLabel} pr={isPr} onToggleDone={onToggleDone} onRemove={onRemove}>
      {/* Enhets-etiketten ligger UNDER feltet, ikke inni det. Et suffiks inni
          krevde stor høyre-padding, og på en smal mobilkolonne ble det da for
          lite plass igjen til to sifre — tallet forsvant bak "kg"/"reps".
          Etiketten er samtidig alltid synlig nå (ikke bare når feltet er
          tomt, som en placeholder ville vært). */}
      <div className={`grid gap-2 ${bodyweight ? "grid-cols-1" : "grid-cols-2"}`}>
        {!bodyweight && (
          <div className="flex min-w-0 flex-col items-center gap-0.5">
            <div className="flex w-full items-center gap-1">
              <StepperButton symbol="−" label="Reduser vekt" onClick={() => adjustKg(-2.5)} />
              <input
                type="number"
                step="0.5"
                inputMode="decimal"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                onBlur={() => commit(kg, reps)}
                aria-label="Vekt i kg"
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-1 py-1.5 text-center text-lg font-semibold tabular-nums text-ink-1 outline-none focus:border-line-strong"
              />
              <StepperButton symbol="+" label="Øk vekt" onClick={() => adjustKg(2.5)} />
            </div>
            <span className="text-2xs font-medium uppercase tracking-wide text-ink-4">kg</span>
          </div>
        )}
        <div className="flex min-w-0 flex-col items-center gap-0.5">
          <div className="flex w-full items-center gap-1">
            <StepperButton symbol="−" label="Reduser reps" onClick={() => adjustReps(-1)} />
            <input
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              onBlur={() => commit(kg, reps)}
              aria-label="Antall reps"
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-1 py-1.5 text-center text-lg font-semibold tabular-nums text-ink-1 outline-none focus:border-line-strong"
            />
            <StepperButton symbol="+" label="Øk reps" onClick={() => adjustReps(1)} />
          </div>
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-4">reps</span>
        </div>
      </div>
    </SetRowShell>
  );
}

function CardioSetRow({
  set,
  index,
  previousLabel,
  onUpdate,
  onToggleDone,
  onRemove,
}: {
  set: SetLog;
  index: number;
  previousLabel?: string;
  onUpdate: (updates: { minutes: number | null; kmt: number | null; distanceKm: number | null; intensity: SetIntensity | null }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}) {
  const [minutes, setMinutes] = useState(set.minutes?.toString() ?? "");
  const [kmt, setKmt] = useState(set.kmt?.toString() ?? "");
  const [distanceKm, setDistanceKm] = useState(set.distanceKm?.toString() ?? "");
  const [intensity, setIntensity] = useState<SetIntensity | "">(set.intensity ?? "");

  function commit(nextMinutes: string, nextKmt: string, nextDistanceKm: string, nextIntensity: SetIntensity | "") {
    onUpdate({
      minutes: nextMinutes.trim() ? Number(nextMinutes) : null,
      kmt: nextKmt.trim() ? Number(nextKmt) : null,
      distanceKm: nextDistanceKm.trim() ? Number(nextDistanceKm) : null,
      intensity: nextIntensity || null,
    });
  }

  function adjustMinutes(delta: number) {
    vibrate(6);
    const current = minutes.trim() ? Number(minutes) : 0;
    const next = Math.max(0, current + delta);
    const nextStr = String(next);
    setMinutes(nextStr);
    commit(nextStr, kmt, distanceKm, intensity);
  }

  function adjustKmt(delta: number) {
    vibrate(6);
    const current = kmt.trim() ? Number(kmt) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setKmt(nextStr);
    commit(minutes, nextStr, distanceKm, intensity);
  }

  function adjustDistanceKm(delta: number) {
    vibrate(6);
    const current = distanceKm.trim() ? Number(distanceKm) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setDistanceKm(nextStr);
    commit(minutes, kmt, nextStr, intensity);
  }

  return (
    <SetRowShell index={index} done={!!set.done} previousLabel={previousLabel} onToggleDone={onToggleDone} onRemove={onRemove}>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser minutter" onClick={() => adjustMinutes(-1)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Min"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-1 py-1.5 pl-2 pr-8 text-left text-base font-semibold tabular-nums text-ink-1 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-ink-4 focus:border-line-strong sm:text-lg"
            />
            {minutes.trim() && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-4">min</span>
            )}
          </div>
          <StepperButton symbol="+" label="Øk minutter" onClick={() => adjustMinutes(1)} />
        </div>
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser km/t" onClick={() => adjustKmt(-0.5)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              step="0.5"
              inputMode="decimal"
              value={kmt}
              onChange={(e) => setKmt(e.target.value)}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Km/t"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-1 py-1.5 pl-2 pr-10 text-left text-base font-semibold tabular-nums text-ink-1 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-ink-4 focus:border-line-strong sm:text-lg"
            />
            {kmt.trim() && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-4">km/t</span>
            )}
          </div>
          <StepperButton symbol="+" label="Øk km/t" onClick={() => adjustKmt(0.5)} />
        </div>
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser distanse" onClick={() => adjustDistanceKm(-0.5)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              step="0.5"
              inputMode="decimal"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Distanse"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-1 py-1.5 pl-2 pr-8 text-left text-base font-semibold tabular-nums text-ink-1 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-ink-4 focus:border-line-strong sm:text-lg"
            />
            {distanceKm.trim() && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-4">km</span>
            )}
          </div>
          <StepperButton symbol="+" label="Øk distanse" onClick={() => adjustDistanceKm(0.5)} />
        </div>
        <select
          value={intensity}
          onChange={(e) => {
            const next = e.target.value as SetIntensity | "";
            setIntensity(next);
            commit(minutes, kmt, distanceKm, next);
          }}
          className="w-full rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          <option value="">Intensitet...</option>
          {INTENSITY_OPTIONS.map((i) => (
            <option key={i} value={i}>
              {INTENSITY_LABEL[i]}
            </option>
          ))}
        </select>
      </div>
    </SetRowShell>
  );
}

function EntryRow({
  entry,
  lastEntry,
  history,
  bodyweight = false,
  startExpanded = false,
  onAddSet,
  onUpdateSet,
  onToggleSetDone,
  onRemoveSet,
  onUpdateEntry,
  onToggleEntryDone,
  onRemoveEntry,
}: {
  entry: WorkoutEntry;
  lastEntry: WorkoutEntry | null;
  history: ExerciseHistoryPoint[];
  bodyweight?: boolean;
  startExpanded?: boolean;
  onAddSet: (prefill: { kg?: number; reps?: number; minutes?: number; kmt?: number; distanceKm?: number; intensity?: SetIntensity }) => void;
  onUpdateSet: (
    setId: string,
    updates: {
      kg?: number | null;
      reps?: number | null;
      minutes?: number | null;
      kmt?: number | null;
      distanceKm?: number | null;
      intensity?: SetIntensity | null;
    },
  ) => void;
  onToggleSetDone: (setId: string, done: boolean) => void;
  onRemoveSet: (setId: string) => void;
  onUpdateEntry: (updates: { minutes: number | null; notes: string | null }) => void;
  onToggleEntryDone: () => void;
  onRemoveEntry: () => void;
}) {
  const [minutes, setMinutes] = useState(entry.minutes?.toString() ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [showGraph, setShowGraph] = useState(false);
  const [showMore, setShowMore] = useState(!!entry.minutes || !!entry.notes);
  // Lukket (sammenslått) rad viser KUN øvelsesnavnet — man drilles ned igjen
  // ved å trykke raden. Starter kollapset (i motsetning til før) slik at en
  // økt med mange øvelser forblir oversiktlig med det samme man legger dem
  // til, i stedet for at man må lukke hver og én manuelt — MED unntak av
  // øvelsen man akkurat la til (startExpanded), som skal være klar for
  // sett-registrering med det samme uten en ekstra åpne-handling.
  const [collapsed, setCollapsed] = useState(!startExpanded);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  function commitEntry() {
    onUpdateEntry({
      minutes: minutes.trim() ? Number(minutes) : null,
      notes: notes.trim() || null,
    });
  }

  // Høyeste vekt noensinne på tvers av ALLE tidligere økter (ikke bare
  // forrige) — grunnlaget for PR-badgen i StrengthSetRow.
  const bestEverKg = history.length > 0 ? Math.max(...history.map((h) => h.maxKg)) : 0;

  // Foreslår vekt/reps (eller minutter/km-t/intensitet for cardio) for et nytt
  // sett fra forrige sett i samme øvelse denne økten, ellers fra "sist"-
  // referansen — matcher hvordan Strong/Hevy foreslår neste vekt i stedet for
  // å starte tomt hver gang.
  function handleAddSetClick() {
    vibrate(8);
    const prevSet = entry.sets[entry.sets.length - 1] ?? lastEntry?.sets[0];
    onAddSet({
      kg: prevSet?.kg,
      reps: prevSet?.reps,
      minutes: prevSet?.minutes,
      kmt: prevSet?.kmt,
      distanceKm: prevSet?.distanceKm,
      intensity: prevSet?.intensity,
    });
  }

  const gripHandle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Endre rekkefølge"
      className="grid shrink-0 cursor-grab place-items-center text-ink-4 transition hover:text-ink-2 active:cursor-grabbing"
      style={{ touchAction: "none" }}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  const doneToggle = (
    <DoneToggle
      done={!!entry.done}
      onToggle={onToggleEntryDone}
      label={entry.done ? "Merk øvelsen som ikke fullført" : "Merk øvelsen som fullført"}
    />
  );

  // Venstre kant-stripe skiller to ulike konsepter fra hverandre: "aktiv nå"
  // (utvidet, accent-privat — appens signal for "relevant nå") vs. "fullført"
  // (status-positive, en sluttilstand som prioriteres visuelt over aktiv).
  // Kategorifargen (styrke/cardio) er bevisst IKKE brukt her — den lever kun
  // i ikon-chippen, slik at kant-stripen ikke blir tvetydig mellom "dette er
  // cardio" og "dette jobber jeg med".
  const containerClass = `rounded-xl border-l-[3px] border transition ${
    entry.done
      ? "border-l-status-positive border-status-positive/50 bg-status-positive/10"
      : collapsed
        ? "border-l-transparent border-line bg-surface-1"
        : "border-l-accent-privat border-line-strong bg-surface-1"
  }`;

  const CategoryIcon = CATEGORY_ICON[entry.category];
  const categoryChip = (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${CATEGORY_ACCENT[entry.category].replace("text-", "bg-")}/10`}
    >
      <CategoryIcon className={`h-3 w-3 ${CATEGORY_ACCENT[entry.category]}`} />
    </span>
  );

  if (collapsed) {
    return (
      <li ref={setNodeRef} style={style} className={`${containerClass} px-3 py-2.5`}>
        <div className="flex items-center gap-2">
          {gripHandle}
          {doneToggle}
          <button type="button" onClick={() => setCollapsed(false)} aria-expanded={false} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {categoryChip}
            <p className="truncate text-sm font-semibold text-ink-1">{entry.exerciseName}</p>
          </button>
          <button
            type="button"
            onClick={onRemoveEntry}
            aria-label="Fjern øvelse fra økten"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`${containerClass} flex flex-col gap-2 px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {gripHandle}
          {doneToggle}
          <button type="button" onClick={() => setCollapsed(true)} aria-expanded={true} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {categoryChip}
            <p className="truncate text-sm font-semibold text-ink-1">{entry.exerciseName}</p>
          </button>
        </div>
        <button
          type="button"
          onClick={onRemoveEntry}
          aria-label="Fjern øvelse fra økten"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Egne chips per sett i stedet for én lang komma-separert tekststreng
          — mer oversiktlig å skanne, og bryter pent over flere linjer i
          stedet for å bli en tekstvegg for øvelser med mange sett. */}
      {lastEntry && lastEntry.sets.some((s) => formatSetLog(s)) && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-2xs font-medium text-ink-4">Forrige økt:</span>
          {lastEntry.sets.slice(-4).map((s, i) => {
            const label = formatSetLog(s);
            return label ? (
              <span key={i} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs tabular-nums text-ink-3">
                {label}
              </span>
            ) : null;
          })}
        </div>
      )}
      {history.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowGraph((v) => !v)}
            aria-expanded={showGraph}
            className="self-start text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
          >
            {showGraph ? "Skjul graf" : "Vis graf"}
          </button>
          {showGraph && <ProgressChart points={history} />}
        </div>
      )}
      {entry.sets.length > 0 && (
        <div className="flex flex-col gap-2">
          {entry.sets.map((s, i) => {
            // Samme sett-indeks forrige gang øvelsen ble logget — vist som en
            // dempet "spøkelses"-verdi rett ved dette settet, i tillegg til
            // den sammenslåtte "Sist:"-linjen over. Gir progresjon sett-for-
            // sett i stedet for bare et aggregert sammendrag.
            const previousLabel = lastEntry?.sets[i] ? formatSetLog(lastEntry.sets[i]) ?? undefined : undefined;
            return entry.category === "cardio" ? (
              <CardioSetRow
                key={s.id}
                set={s}
                index={i}
                previousLabel={previousLabel}
                onUpdate={(updates) => onUpdateSet(s.id, updates)}
                onToggleDone={() => onToggleSetDone(s.id, !s.done)}
                onRemove={() => onRemoveSet(s.id)}
              />
            ) : (
              <StrengthSetRow
                key={s.id}
                set={s}
                index={i}
                previousLabel={previousLabel}
                bodyweight={bodyweight}
                bestEverKg={bestEverKg}
                onUpdate={(updates) => onUpdateSet(s.id, updates)}
                onToggleDone={() => onToggleSetDone(s.id, !s.done)}
                onRemove={() => onRemoveSet(s.id)}
              />
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleAddSetClick}
          className="rounded-lg border border-accent-privat/40 bg-accent-privat/10 px-3 py-1.5 text-xs font-semibold text-accent-privat transition hover:border-accent-privat/60 hover:bg-accent-privat/15"
        >
          + Nytt sett
        </button>
        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="shrink-0 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
          >
            {entry.category === "cardio" ? "+ Notat" : "+ Minutter/notat"}
          </button>
        )}
      </div>
      {showMore && (
        <div className="grid grid-cols-2 gap-2">
          {entry.category !== "cardio" && (
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={commitEntry}
              placeholder="Minutter"
              className="w-full rounded-lg border border-transparent bg-surface-2 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitEntry}
            placeholder="Notat (valgfritt)"
            className={`w-full rounded-lg border border-transparent bg-surface-2 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong ${
              entry.category === "cardio" ? "col-span-2" : ""
            }`}
          />
        </div>
      )}
    </li>
  );
}

function CategoryToggle({ value, onChange }: { value: ExerciseCategory; onChange: (c: ExerciseCategory) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {(Object.keys(CATEGORY_LABEL) as ExerciseCategory[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            value === c
              ? "border-accent-privat bg-accent-privat/15 text-accent-privat"
              : "border-line bg-surface-2 text-ink-3 hover:border-line-strong hover:text-ink-1"
          }`}
        >
          {CATEGORY_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

function ExerciseEditForm({
  exercise,
  onCancel,
  onSave,
}: {
  exercise: Exercise;
  onCancel: () => void;
  onSave: (updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(exercise.category);
  const [bodyweight, setBodyweight] = useState(!!exercise.bodyweight);
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, category, bodyweight: category === "styrke" && bodyweight });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <CategoryToggle value={category} onChange={setCategory} />
      {category === "styrke" && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={bodyweight}
            onChange={(e) => setBodyweight(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line accent-accent-privat"
          />
          Kroppsvekt (skjul kg-felt)
        </label>
      )}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beskrivelse (valgfritt)"
        rows={2}
        className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </li>
  );
}

function ExercisePicker({
  exercises,
  onPick,
  onCreateAndPick,
  onSaveExercise,
  onDeleteExercise,
  onClose,
}: {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  onCreateAndPick: (name: string, description: string, category: ExerciseCategory, bodyweight: boolean) => Promise<boolean>;
  onSaveExercise: (id: string, updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean }) => Promise<boolean>;
  onDeleteExercise: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<ExerciseCategory>("styrke");
  const [newBodyweight, setNewBodyweight] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function handleCreateClick() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const ok = await onCreateAndPick(newName.trim(), newDescription.trim(), newCategory, newCategory === "styrke" && newBodyweight);
      if (ok) {
        setNewName("");
        setNewDescription("");
        setNewCategory("styrke");
        setNewBodyweight(false);
        setShowNewForm(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      {/* Søk og opprett ligger side ved side helt øverst — begge er
          like tilgjengelige med det samme, ikke gjemt bak "ingen treff". */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk øvelse..."
          aria-label="Søk øvelse"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          aria-pressed={showNewForm}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold uppercase transition ${
            showNewForm
              ? "border-accent-privat bg-accent-privat/15 text-accent-privat"
              : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:text-ink-1"
          }`}
        >
          + Opprett
        </button>
      </div>
      {showNewForm && (
        <div className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Navn på øvelse"
            className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <CategoryToggle value={newCategory} onChange={setNewCategory} />
          {newCategory === "styrke" && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={newBodyweight}
                onChange={(e) => setNewBodyweight(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line accent-accent-privat"
              />
              Kroppsvekt (skjul kg-felt)
            </label>
          )}
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Beskrivelse (valgfritt)"
            rows={2}
            className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowNewForm(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
              Avbryt
            </button>
            <button
              type="button"
              onClick={handleCreateClick}
              disabled={!newName.trim() || creating}
              className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
            >
              Legg til
            </button>
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {filtered.map((ex) =>
            editingId === ex.id ? (
              <ExerciseEditForm
                key={ex.id}
                exercise={ex}
                onCancel={() => setEditingId(null)}
                onSave={async (updates) => {
                  const ok = await onSaveExercise(ex.id, updates);
                  if (ok) setEditingId(null);
                  return ok;
                }}
              />
            ) : (
              <li key={ex.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-2">
                <button type="button" onClick={() => onPick(ex)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${CATEGORY_ACCENT[ex.category].replace("text-", "bg-")}/10`}>
                      {(() => {
                        const Icon = CATEGORY_ICON[ex.category];
                        return <Icon className={`h-3 w-3 ${CATEGORY_ACCENT[ex.category]}`} />;
                      })()}
                    </span>
                    <p className="truncate text-sm font-medium text-ink-1">{ex.name}</p>
                  </div>
                  {ex.description && <p className="truncate text-2xs text-ink-4">{ex.description}</p>}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(ex.id)}
                  aria-label="Rediger øvelse"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteExercise(ex)}
                  aria-label="Slett øvelse"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {filtered.length === 0 && <p className="text-sm text-ink-3">Ingen treff.</p>}
      <button type="button" onClick={onClose} className="self-end text-xs font-medium text-ink-4 hover:text-ink-2">
        Lukk
      </button>
    </div>
  );
}

function RoutineRow({
  routine,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onStart,
  onDelete,
}: {
  routine: Routine;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (name: string) => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(routine.name);

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancelEdit();
          }}
          className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancelEdit} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
            className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
          >
            Lagre
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-1">{routine.name}</p>
        <p className="truncate text-2xs text-ink-4">{routine.exercises.map((e) => e.exerciseName).join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="shrink-0 rounded-lg bg-accent-privat px-2.5 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
      >
        Start
      </button>
      <button
        type="button"
        onClick={onStartEdit}
        aria-label="Omdøp rutine"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Slett rutine"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// Handlingene som trengs for å redigere sett/øvelser i EN bestemt økt —
// samme form som de aktive-økt-spesifikke handlerne i TreningSection
// (handleAddSet osv.), men parameterisert på en vilkårlig sessionId slik at
// de også kan brukes til å redigere en AVSLUTTET økt i historikken.
interface SessionEditHandlers {
  onAddEntry: (exercise: Exercise) => void;
  onUpdateEntry: (entryId: string, updates: { minutes: number | null; notes: string | null }) => void;
  onRemoveEntry: (entryId: string) => void;
  onAddSet: (
    entryId: string,
    prefill: { kg?: number; reps?: number; minutes?: number; kmt?: number; distanceKm?: number; intensity?: SetIntensity },
  ) => void;
  onUpdateSet: (
    entryId: string,
    setId: string,
    updates: { kg?: number | null; reps?: number | null; minutes?: number | null; kmt?: number | null; distanceKm?: number | null; intensity?: SetIntensity | null },
  ) => void;
  onToggleSetDone: (entryId: string, setId: string, done: boolean) => void;
  onRemoveSet: (entryId: string, setId: string) => void;
  onToggleEntryDone: (entryId: string, done: boolean) => void;
}

// Full redigering av en tidligere (avsluttet) økt — gjenbruker EntryRow (samme
// rad som den aktive økten bruker) i stedet for kun HistoryRow sitt
// skrivebeskyttede sammendrag, jf. ønske om å kunne rette opp sett/øvelser i
// ettertid, ikke bare mens klokken går.
function HistorySessionEditor({
  session,
  exercises,
  sessions,
  handlers,
  onCreateAndAdd,
  onSaveExercise,
  onDeleteExercise,
}: {
  session: WorkoutSession;
  exercises: Exercise[];
  sessions: WorkoutSession[];
  handlers: SessionEditHandlers;
  onCreateAndAdd: (name: string, description: string, category: ExerciseCategory, bodyweight: boolean) => Promise<boolean>;
  onSaveExercise: (id: string, updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean }) => Promise<boolean>;
  onDeleteExercise: (exercise: Exercise) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
      {session.entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {session.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              lastEntry={findLastEntry(entry.exerciseId, sessions, session.id)}
              history={exerciseHistory(entry.exerciseId, sessions, session.id)}
              bodyweight={exercises.find((ex) => ex.id === entry.exerciseId)?.bodyweight}
              startExpanded={false}
              onAddSet={(prefill) => handlers.onAddSet(entry.id, prefill)}
              onUpdateSet={(setId, updates) => handlers.onUpdateSet(entry.id, setId, updates)}
              onToggleSetDone={(setId, done) => handlers.onToggleSetDone(entry.id, setId, done)}
              onRemoveSet={(setId) => handlers.onRemoveSet(entry.id, setId)}
              onUpdateEntry={(updates) => handlers.onUpdateEntry(entry.id, updates)}
              onToggleEntryDone={() => handlers.onToggleEntryDone(entry.id, !entry.done)}
              onRemoveEntry={() => handlers.onRemoveEntry(entry.id)}
            />
          ))}
        </ul>
      )}
      {showPicker ? (
        <ExercisePicker
          exercises={exercises}
          onPick={(ex) => {
            handlers.onAddEntry(ex);
            setShowPicker(false);
          }}
          onCreateAndPick={async (name, description, category, bodyweight) => {
            const ok = await onCreateAndAdd(name, description, category, bodyweight);
            if (ok) setShowPicker(false);
            return ok;
          }}
          onSaveExercise={onSaveExercise}
          onDeleteExercise={onDeleteExercise}
          onClose={() => setShowPicker(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          <span className="text-base leading-none">+</span> Legg til øvelse
        </button>
      )}
    </div>
  );
}

function HistoryRow({
  session,
  expanded,
  editing,
  onToggle,
  onToggleEdit,
  onDelete,
  editor,
}: {
  session: WorkoutSession;
  expanded: boolean;
  editing: boolean;
  onToggle: () => void;
  onToggleEdit: () => void;
  onDelete: () => void;
  editor?: React.ReactNode;
}) {
  const duration = session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0;
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-ink-1">
            {formatSessionDate(session.startedAt)} · {formatSessionTime(session.startedAt)}
          </p>
          <p className="mt-0.5 text-2xs text-ink-4">
            {formatElapsed(duration)} · {session.entries.length} {session.entries.length === 1 ? "øvelse" : "øvelser"}
          </p>
        </button>
        {expanded && (
          <button
            type="button"
            onClick={onToggleEdit}
            className="shrink-0 text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
          >
            {editing ? "Ferdig" : "Rediger"}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Slett økt"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded &&
        (editing ? (
          editor
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
            {session.entries.length === 0 ? (
              <p className="text-sm text-ink-3">Ingen øvelser logget.</p>
            ) : (
              session.entries.map((e) => (
                <li key={e.id} className="text-sm text-ink-2">
                  <span className="font-medium text-ink-1">{e.exerciseName}</span>
                  {e.sets.length > 0 && <span className="text-ink-3"> · {setSummary(e)}</span>}
                  {e.minutes ? <span className="text-ink-3"> · {e.minutes} min</span> : null}
                  {e.notes && <p className="text-2xs text-ink-4">{e.notes}</p>}
                </li>
              ))
            )}
          </ul>
        ))}
    </li>
  );
}

// Månedskalender for å bla tilbake i tid og se hvilke dager man har trent —
// prikk under dagtallet på dager med minst én avsluttet økt, trykk en dag
// for å vise økten(e) under rutenettet (gjenbruker HistoryRow, samme
// ekspander/slett-mønster som listevisningen).
function TrainingCalendar({
  sessionsByDate,
  monthOffset,
  onMonthOffsetChange,
  selectedDate,
  onSelectDate,
}: {
  sessionsByDate: Map<string, WorkoutSession[]>;
  monthOffset: number;
  onMonthOffsetChange: (offset: number) => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const today = localDateString();
  const { year, month } = calendarMonthFromOffset(monthOffset);
  const days = calendarMonthDays(year, month);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthOffsetChange(monthOffset - 1)}
          aria-label="Forrige måned"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-ink-1">{formatMonthLabel(year, month)}</p>
        <button
          type="button"
          onClick={() => onMonthOffsetChange(monthOffset + 1)}
          aria-label="Neste måned"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          <p key={w} className="text-center text-2xs font-semibold uppercase text-ink-4">
            {w}
          </p>
        ))}
        {days.map((date) => {
          const inMonth = Number(date.slice(5, 7)) - 1 === month;
          const daySessions = sessionsByDate.get(date) ?? [];
          const hasSessions = daySessions.length > 0;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => (hasSessions ? onSelectDate(isSelected ? null : date) : undefined)}
              disabled={!hasSessions}
              aria-pressed={isSelected}
              className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs transition ${
                !inMonth
                  ? "text-ink-4/50"
                  : isSelected
                    ? "bg-accent-privat/15 font-semibold text-accent-privat ring-1 ring-accent-privat/40"
                    : isToday
                      ? "font-semibold text-ink-1 ring-1 ring-line-strong"
                      : hasSessions
                        ? "text-ink-1 hover:bg-surface-3"
                        : "text-ink-3"
              }`}
            >
              {Number(date.slice(8, 10))}
              <span
                className={`h-1 w-1 rounded-full ${hasSessions && inMonth ? "bg-status-positive" : "bg-transparent"}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SessionSummary {
  durationMs: number;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
}

// Vises rett etter "Avslutt økt" — samme overlay-mønster som ConfirmDialog i
// app/CardShell.tsx, men ikke-destruktiv (kun én "Lukk"-knapp).
function SessionSummaryDialog({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface-1 p-4 shadow-xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-semibold text-ink-1">Økt fullført</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xs text-ink-4">Varighet</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{formatElapsed(summary.durationMs)}</p>
          </div>
          <div>
            <p className="text-2xs text-ink-4">Øvelser</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{summary.exerciseCount}</p>
          </div>
          <div>
            <p className="text-2xs text-ink-4">Sett</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{summary.setCount}</p>
          </div>
          <div>
            <p className="text-2xs text-ink-4">Totalt volum</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{formatKg(summary.totalVolumeKg)} kg</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-status-positive px-3 py-2 text-sm font-semibold text-surface-0 transition hover:bg-status-positive/85"
        >
          Lukk
        </button>
      </div>
    </div>
  );
}

// Legger til øvelsene fra en rutine i rekkefølge (sekvensielt, ikke parallelt
// — read-modify-write mot samme økt i Redis ville racet ved parallelle kall).
// Egen frittstående funksjon (ikke inne i komponenten) slik at den kan bruke
// en vanlig `let`-akkumulator uten å trigge React Compiler sin immutability-regel.
// Returnerer også antall øvelser som ikke lot seg legge til, slik at kallstedet
// kan varsle brukeren i stedet for å stille starte en ufullstendig økt.
async function seedRoutineEntries(sessionId: string, exercises: Routine["exercises"]): Promise<{ session: WorkoutSession | null; failedCount: number }> {
  let session: WorkoutSession | null = null;
  let failedCount = 0;
  for (const ex of exercises) {
    try {
      const res = await fetch(`/api/workouts/${sessionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName }),
      });
      if (res.ok) session = await res.json();
      else failedCount++;
    } catch {
      failedCount++;
    }
  }
  return { session, failedCount };
}

export default function TreningSection() {
  const { data: sessionsData, isLoading: loading, mutate: mutateSessions } = useSWR<{ sessions: WorkoutSession[] }>("/api/workouts", jsonFetcher);
  const { data: exercisesData, mutate: mutateExercises } = useSWR<{ exercises: Exercise[] }>("/api/exercises", jsonFetcher);
  const { data: routinesData, mutate: mutateRoutines } = useSWR<{ routines: Routine[] }>("/api/routines", jsonFetcher);
  const sessions = sessionsData?.sessions ?? EMPTY_SESSIONS;
  const exercises = exercisesData?.exercises ?? EMPTY_EXERCISES;
  const routines = routinesData?.routines ?? EMPTY_ROUTINES;
  const [showPicker, setShowPicker] = useState(false);
  // Id-en til den sist tilførte øvelsen — sendt ned til EntryRow slik at
  // akkurat DEN raden monteres utvidet (heller enn appens vanlige
  // "starter kollapset"-regel), så man kan registrere sett med det samme
  // uten å måtte åpne raden man nettopp la til.
  const [justAddedEntryId, setJustAddedEntryId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  // Hvilken tidligere økt som akkurat nå redigeres fullt ut (ikke bare vist
  // som sammendrag) — kun én om gangen, nullstilt når raden lukkes/skiftes.
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // "Sett opp økt": velg øvelser FØR klokken starter, i stedet for kun å
  // kunne legge til underveis i en allerede pågående økt — se
  // handleStartWithExercises, som oppretter økten og seeder alt i ett steg.
  const [showSetup, setShowSetup] = useState(false);
  const [showSetupPicker, setShowSetupPicker] = useState(false);
  const [draftExercises, setDraftExercises] = useState<{ exerciseId: string; exerciseName: string }[]>([]);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(VISIBLE_HISTORY);
  const [historyView, setHistoryView] = useState<"list" | "calendar">("list");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [showSaveRoutineForm, setShowSaveRoutineForm] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const confirmDeleteSession = useConfirmDelete<WorkoutSession>();
  const confirmDeleteExercise = useConfirmDelete<Exercise>();
  const confirmDeleteRoutine = useConfirmDelete<Routine>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const mutationError = useMutationError();

  const activeSession = sessions.find((s) => !s.endedAt) ?? null;
  const pastSessions = sessions.filter((s) => s.endedAt);
  const visibleHistory = pastSessions.slice(0, visibleHistoryCount);
  const sessionsByDate = new Map<string, WorkoutSession[]>();
  for (const s of pastSessions) {
    const date = toOsloDateString(new Date(s.startedAt));
    const list = sessionsByDate.get(date) ?? [];
    list.push(s);
    sessionsByDate.set(date, list);
  }
  const selectedDateSessions = selectedCalendarDate ? (sessionsByDate.get(selectedCalendarDate) ?? []) : [];
  // Ukesstripa over lista: mandag til søndag i inneværende uke, med dagens dag
  // markert. Bevisst binær (trent / ikke trent) og ikke høydekodet — antall
  // øvelser sier lite om hvor hard økten var, så en søylehøyde ville vært en
  // påstand dataen ikke dekker.
  const treningToday = localDateString();
  const { start: weekStart } = weekRangeContaining(treningToday);
  const weekDayIsos = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const weekActiveDays = weekDayIsos.map((d) => sessionsByDate.has(d));
  const weekTodayIndex = weekDayIsos.indexOf(treningToday);
  const weekSessionCount = weekActiveDays.filter(Boolean).length;
  const elapsed = useElapsed(activeSession?.startedAt);
  const restTimer = useRestTimer();
  // Sannsynligvis glemt å avslutte økten hvis den har vart urimelig lenge —
  // vi har sett dette skje i praksis under testing av denne seksjonen.
  const isLongSession = !!activeSession && elapsed > 3 * 60 * 60 * 1000;

  async function handleStartSession() {
    try {
      const res = await fetch("/api/workouts", { method: "POST" });
      if (!res.ok) throw new Error("start failed");
      const session: WorkoutSession = await res.json();
      mutateSessions((current) => {
        if (!current) return current;
        const exists = current.sessions.some((s) => s.id === session.id);
        return { sessions: exists ? current.sessions.map((s) => (s.id === session.id ? session : s)) : [session, ...current.sessions] };
      }, { revalidate: false });
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke starte økten. Prøv igjen.");
    }
  }

  // Felles for "start fra rutine" OG "start fra en selv-satt-sammen liste"
  // (se draftExercises/handleSetupStart under) — oppretter økten og seeder
  // alle øvelsene i ett steg, i stedet for at man må legge dem til én og én
  // etter at klokken allerede har startet.
  async function handleStartWithExercises(list: { exerciseId: string; exerciseName: string }[]) {
    try {
      const res = await fetch("/api/workouts", { method: "POST" });
      if (!res.ok) throw new Error("start failed");
      const started: WorkoutSession = await res.json();
      mutateSessions((current) => {
        if (!current) return current;
        const exists = current.sessions.some((s) => s.id === started.id);
        return { sessions: exists ? current.sessions.map((s) => (s.id === started.id ? started : s)) : [started, ...current.sessions] };
      }, { revalidate: false });
      if (list.length > 0) {
        const { session: seeded, failedCount } = await seedRoutineEntries(started.id, list);
        if (seeded) {
          mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === seeded.id ? seeded : s)) }, { revalidate: false });
        }
        if (failedCount > 0) {
          mutationError.show(`Klarte ikke å legge til ${failedCount} ${failedCount === 1 ? "øvelse" : "øvelser"}. Legg dem til manuelt.`);
        }
      }
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke starte økten. Prøv igjen.");
    }
  }

  async function handleStartFromRoutine(routine: Routine) {
    await handleStartWithExercises(routine.exercises);
  }

  async function handleSetupStart() {
    const list = draftExercises;
    setShowSetup(false);
    setShowSetupPicker(false);
    setDraftExercises([]);
    await handleStartWithExercises(list);
  }

  async function handleEndSession() {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("end failed");
      vibrate([10, 30, 10]);
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
      setShowPicker(false);
      setShowSaveRoutineForm(false);
      const sets = updated.entries.flatMap((e) => e.sets);
      const totalVolumeKg = sets.reduce((sum, s) => (s.kg != null && s.reps != null ? sum + s.kg * s.reps : sum), 0);
      setSessionSummary({
        durationMs: new Date(updated.endedAt!).getTime() - new Date(updated.startedAt).getTime(),
        exerciseCount: updated.entries.length,
        setCount: sets.length,
        totalVolumeKg,
      });
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke avslutte økten. Prøv igjen.");
    }
  }

  async function handleReorderEntries(event: DragEndEvent) {
    if (!activeSession) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = activeSession.entries.map((e) => e.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    const previousEntries = activeSession.entries;
    mutateSessions(
      (current) =>
        current && {
          sessions: current.sessions.map((s) =>
            s.id === activeSession.id ? { ...s, entries: reordered.map((id) => s.entries.find((e) => e.id === id)!) } : s,
          ),
        },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered }),
      });
      if (!res.ok) throw new Error("reorder failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutateSessions(
        (current) => current && { sessions: current.sessions.map((s) => (s.id === activeSession.id ? { ...s, entries: previousEntries } : s)) },
        { revalidate: false },
      );
      mutationError.show("Kunne ikke lagre ny rekkefølge. Prøv igjen.");
    }
  }

  async function handleAddEntry(exercise: Exercise) {
    if (!activeSession) return;
    const existingIds = new Set(activeSession.entries.map((e) => e.id));
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, exerciseName: exercise.name }),
      });
      if (!res.ok) throw new Error("add entry failed");
      vibrate(8);
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
      setJustAddedEntryId(updated.entries.find((e) => !existingIds.has(e.id))?.id ?? null);
      // Lukk øvelsesvelgeren igjen etter valg/opprettelse — skjermen går
      // tilbake til kun "+ Legg til øvelse", i stedet for at søk/opprett-
      // panelet blir stående åpent (samme for begge kall-veiene, siden
      // handleCreateExerciseAndAdd selv kaller denne funksjonen under).
      setShowPicker(false);
    } catch {
      mutationError.show("Kunne ikke legge til øvelsen. Prøv igjen.");
    }
  }

  // Kun opprettelsen — hvor den nye øvelsen skal HAVNE (lagt til aktiv økt,
  // lagt i draftExercises, eller lagt til en tidligere økt) avgjøres av
  // hvilken av de tre wrapperne under som kaller denne.
  async function handleCreateExercise(
    name: string,
    description: string,
    category: ExerciseCategory,
    bodyweight: boolean,
  ): Promise<Exercise | null> {
    if (!name.trim()) return null;
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, category, bodyweight }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke opprette øvelsen. Prøv igjen.");
        return null;
      }
      const created: Exercise = await res.json();
      mutateExercises(
        (current) => current && { exercises: [...current.exercises, created].sort((a, b) => a.name.localeCompare(b.name, "nb")) },
        { revalidate: false },
      );
      return created;
    } catch {
      mutationError.show("Kunne ikke opprette øvelsen. Prøv igjen.");
      return null;
    }
  }

  async function handleCreateExerciseAndAdd(
    name: string,
    description: string,
    category: ExerciseCategory,
    bodyweight: boolean,
  ): Promise<boolean> {
    const created = await handleCreateExercise(name, description, category, bodyweight);
    if (!created) return false;
    await handleAddEntry(created);
    return true;
  }

  // Draft-varianten av "opprett og legg til" — brukt av "Sett opp økt"-
  // panelet FØR økten faktisk er startet, så det finnes ingen sessionId å
  // POSTe en entry til ennå. Legger i stedet den nye øvelsen rett i
  // draftExercises, samme liste som ExercisePicker-valg fra biblioteket
  // havner i.
  async function handleCreateExerciseForDraft(
    name: string,
    description: string,
    category: ExerciseCategory,
    bodyweight: boolean,
  ): Promise<boolean> {
    const created = await handleCreateExercise(name, description, category, bodyweight);
    if (!created) return false;
    setDraftExercises((cur) => [...cur, { exerciseId: created.id, exerciseName: created.name }]);
    return true;
  }

  // Generisk mutasjon mot EN vilkårlig økt (ikke nødvendigvis den aktive) —
  // grunnlaget for sessionEditHandlers under, som lar HistorySessionEditor
  // redigere en avsluttet økt med akkurat samme sett/øvelse-håndtering som
  // den aktive økten bruker.
  async function mutateSessionApi(sessionId: string, path: string, method: string, body?: unknown): Promise<WorkoutSession | null> {
    try {
      const res = await fetch(`/api/workouts/${sessionId}${path}`, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error("request failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
      return updated;
    } catch {
      mutationError.show("Kunne ikke lagre endringen. Prøv igjen.");
      return null;
    }
  }

  function sessionEditHandlers(sessionId: string): SessionEditHandlers {
    return {
      onAddEntry: (exercise) => {
        void mutateSessionApi(sessionId, "/entries", "POST", { exerciseId: exercise.id, exerciseName: exercise.name });
      },
      onUpdateEntry: (entryId, updates) => void mutateSessionApi(sessionId, `/entries/${entryId}`, "PATCH", updates),
      onRemoveEntry: (entryId) => void mutateSessionApi(sessionId, `/entries/${entryId}`, "DELETE"),
      onAddSet: (entryId, prefill) => void mutateSessionApi(sessionId, `/entries/${entryId}/sets`, "POST", prefill),
      onUpdateSet: (entryId, setId, updates) => void mutateSessionApi(sessionId, `/entries/${entryId}/sets/${setId}`, "PATCH", updates),
      onToggleSetDone: (entryId, setId, done) => void mutateSessionApi(sessionId, `/entries/${entryId}/sets/${setId}`, "PATCH", { done }),
      onRemoveSet: (entryId, setId) => void mutateSessionApi(sessionId, `/entries/${entryId}/sets/${setId}`, "DELETE"),
      onToggleEntryDone: (entryId, done) => void mutateSessionApi(sessionId, `/entries/${entryId}`, "PATCH", { done }),
    };
  }

  async function handleCreateExerciseAndAddToSession(
    sessionId: string,
    name: string,
    description: string,
    category: ExerciseCategory,
    bodyweight: boolean,
  ): Promise<boolean> {
    const created = await handleCreateExercise(name, description, category, bodyweight);
    if (!created) return false;
    await mutateSessionApi(sessionId, "/entries", "POST", { exerciseId: created.id, exerciseName: created.name });
    return true;
  }

  async function handleUpdateEntry(entryId: string, updates: { minutes: number | null; notes: string | null }) {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("update entry failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  async function handleRemoveEntry(entryId: string) {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove entry failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke fjerne øvelsen. Prøv igjen.");
    }
  }

  async function handleAddSet(
    entryId: string,
    prefill: { kg?: number; reps?: number; minutes?: number; kmt?: number; distanceKm?: number; intensity?: SetIntensity },
  ) {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefill),
      });
      if (!res.ok) throw new Error("add set failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke legge til settet. Prøv igjen.");
    }
  }

  async function handleUpdateSet(
    entryId: string,
    setId: string,
    updates: {
      kg?: number | null;
      reps?: number | null;
      minutes?: number | null;
      kmt?: number | null;
      distanceKm?: number | null;
      intensity?: SetIntensity | null;
    },
  ) {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("update set failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke lagre settet. Prøv igjen.");
    }
  }

  async function handleToggleSetDone(entryId: string, setId: string, done: boolean) {
    if (!activeSession) return;
    vibrate(done ? 10 : 6);
    // Hviletidtaker starter automatisk når et sett markeres fullført — ikke
    // når det angres. Ingen tidtaker ved siste sett i øvelsen er heller
    // ingen god idé i seg selv, men vi lar det være opp til brukeren å
    // hoppe over den i stedet for å prøve å gjette "er dette siste sett".
    if (done) restTimer.start(DEFAULT_REST_SECONDS);
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error("toggle set failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
      // Synker øvelsen sin egen "ferdig"-tilstand mot settene sine — uten
      // dette måtte man trykke av øvelsen manuelt i tillegg til hvert sett,
      // selv om alle settene allerede var fullført.
      const updatedEntry = updated.entries.find((e) => e.id === entryId);
      if (updatedEntry && updatedEntry.sets.length > 0) {
        const allDone = updatedEntry.sets.every((s) => s.done);
        if (allDone !== !!updatedEntry.done) handleToggleEntryDone(entryId, allDone);
      }
    } catch {
      mutationError.show("Kunne ikke oppdatere settet. Prøv igjen.");
    }
  }

  async function handleToggleEntryDone(entryId: string, done: boolean) {
    if (!activeSession) return;
    vibrate(done ? [10, 20] : 6);
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error("toggle entry failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke oppdatere øvelsen. Prøv igjen.");
    }
  }

  async function handleRemoveSet(entryId: string, setId: string) {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets/${setId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove set failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke fjerne settet. Prøv igjen.");
    }
  }

  async function handleDeleteSession(session: WorkoutSession) {
    let previous: WorkoutSession[] = [];
    mutateSessions(
      (current) => {
        previous = current?.sessions ?? [];
        return current && { sessions: current.sessions.filter((s) => s.id !== session.id) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/workouts/${session.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete session failed");
    } catch {
      mutateSessions({ sessions: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette økten. Prøv igjen.");
    }
  }

  async function handleSaveExercise(
    id: string,
    updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean },
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/exercises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke lagre øvelsen. Prøv igjen.");
        return false;
      }
      const updated: Exercise = await res.json();
      mutateExercises(
        (current) =>
          current && { exercises: current.exercises.map((e) => (e.id === id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name, "nb")) },
        { revalidate: false },
      );
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre øvelsen. Prøv igjen.");
      return false;
    }
  }

  async function handleDeleteExercise(exercise: Exercise) {
    let previous: Exercise[] = [];
    mutateExercises(
      (current) => {
        previous = current?.exercises ?? [];
        return current && { exercises: current.exercises.filter((e) => e.id !== exercise.id) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/exercises/${exercise.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete exercise failed");
    } catch {
      mutateExercises({ exercises: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette øvelsen. Prøv igjen.");
    }
  }

  async function handleSaveRoutine(name: string) {
    if (!activeSession || !name.trim()) return;
    const seen = new Set<string>();
    const routineExercises = activeSession.entries
      .filter((e) => {
        if (seen.has(e.exerciseId)) return false;
        seen.add(e.exerciseId);
        return true;
      })
      .map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName }));
    if (routineExercises.length === 0) return;

    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), exercises: routineExercises }),
      });
      if (!res.ok) throw new Error("save routine failed");
      const created: Routine = await res.json();
      mutateRoutines(
        (current) => current && { routines: [...current.routines, created].sort((a, b) => a.name.localeCompare(b.name, "nb")) },
        { revalidate: false },
      );
      setShowSaveRoutineForm(false);
      setNewRoutineName("");
    } catch {
      mutationError.show("Kunne ikke lagre rutinen. Prøv igjen.");
    }
  }

  async function handleRenameRoutine(id: string, name: string) {
    try {
      const res = await fetch(`/api/routines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("rename routine failed");
      const updated: Routine = await res.json();
      mutateRoutines(
        (current) => current && { routines: current.routines.map((r) => (r.id === id ? updated : r)).sort((a, b) => a.name.localeCompare(b.name, "nb")) },
        { revalidate: false },
      );
      setEditingRoutineId(null);
    } catch {
      mutationError.show("Kunne ikke lagre navnet. Prøv igjen.");
    }
  }

  async function handleDeleteRoutine(routine: Routine) {
    let previous: Routine[] = [];
    mutateRoutines(
      (current) => {
        previous = current?.routines ?? [];
        return current && { routines: current.routines.filter((r) => r.id !== routine.id) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/routines/${routine.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete routine failed");
    } catch {
      mutateRoutines({ routines: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette rutinen. Prøv igjen.");
    }
  }

  return (
    <div className="border-t-2 border-t-emerald-400/60 p-4">
      <CardHeader
        title="Trening"
        // Nøkkeltallet er økter denne uka, ikke totalt gjennom alle tider —
        // det er tallet som faktisk sier noe om hvordan det går nå. Under en
        // aktiv økt viker det for stoppeklokka.
        stat={activeSession ? undefined : { value: weekSessionCount, label: "økter i uka" }}
        subtitle={activeSession ? formatElapsed(elapsed) : undefined}
        alwaysShowSubtitle={!!activeSession}
        icon={Dumbbell}
        iconColorClass="text-emerald-400"
      />
        <div className="flex flex-col gap-2">
          <MutationError message={mutationError.message} />
          {!loading && (
            <WeekStrip
              activeDays={weekActiveDays}
              todayIndex={weekTodayIndex === -1 ? null : weekTodayIndex}
              colorClass="text-emerald-400"
              label={`${weekSessionCount} treningsøkter denne uken`}
            />
          )}
          {loading ? (
            <SkeletonRows count={2} />
          ) : (
            <>
              {activeSession ? (
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums text-ink-1">{formatElapsed(elapsed)}</span>
                    <div className="flex items-center gap-3">
                      {activeSession.entries.length > 0 && !showSaveRoutineForm && (
                        <button
                          type="button"
                          onClick={() => setShowSaveRoutineForm(true)}
                          className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
                        >
                          Lagre som rutine
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleEndSession}
                        className="rounded-lg bg-status-positive px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-positive/85"
                      >
                        Avslutt økt
                      </button>
                    </div>
                  </div>
                  {isLongSession && (
                    <p className="text-2xs text-status-warning">
                      Denne økten har vart lenge — glemte du å avslutte den?
                    </p>
                  )}
                  {restTimer.active && (
                    <div className="flex items-center gap-2 rounded-lg border border-accent-privat/40 bg-accent-privat/10 px-3 py-2">
                      <span className="text-sm font-semibold tabular-nums text-accent-privat">Hviler {formatRest(restTimer.remainingMs)}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <StepperButton symbol="−" label="15 sekunder mindre hvile" onClick={() => restTimer.adjust(-REST_ADJUST_SECONDS)} />
                        <StepperButton symbol="+" label="15 sekunder mer hvile" onClick={() => restTimer.adjust(REST_ADJUST_SECONDS)} />
                      </div>
                      <button
                        type="button"
                        onClick={restTimer.stop}
                        className="text-2xs font-medium text-ink-4 hover:text-ink-2"
                      >
                        Hopp over
                      </button>
                    </div>
                  )}
                  {showSaveRoutineForm && (
                    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 p-2">
                      <input
                        type="text"
                        value={newRoutineName}
                        onChange={(e) => setNewRoutineName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRoutine(newRoutineName);
                          if (e.key === "Escape") setShowSaveRoutineForm(false);
                        }}
                        placeholder="Navn på rutine"
                        className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-2 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSaveRoutineForm(false)}
                        className="shrink-0 text-xs font-medium text-ink-4 hover:text-ink-2"
                      >
                        Avbryt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveRoutine(newRoutineName)}
                        disabled={!newRoutineName.trim()}
                        className="shrink-0 rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                      >
                        Lagre
                      </button>
                    </div>
                  )}
                  {activeSession.entries.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorderEntries}>
                      <SortableContext items={activeSession.entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-2">
                          {activeSession.entries.map((entry) => (
                            <EntryRow
                              key={entry.id}
                              entry={entry}
                              lastEntry={findLastEntry(entry.exerciseId, sessions, activeSession.id)}
                              history={exerciseHistory(entry.exerciseId, sessions, activeSession.id)}
                              bodyweight={exercises.find((ex) => ex.id === entry.exerciseId)?.bodyweight}
                              startExpanded={entry.id === justAddedEntryId}
                              onAddSet={(prefill) => handleAddSet(entry.id, prefill)}
                              onUpdateSet={(setId, updates) => handleUpdateSet(entry.id, setId, updates)}
                              onToggleSetDone={(setId, done) => handleToggleSetDone(entry.id, setId, done)}
                              onRemoveSet={(setId) => handleRemoveSet(entry.id, setId)}
                              onUpdateEntry={(updates) => handleUpdateEntry(entry.id, updates)}
                              onToggleEntryDone={() => handleToggleEntryDone(entry.id, !entry.done)}
                              onRemoveEntry={() => handleRemoveEntry(entry.id)}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  )}
                  {showPicker ? (
                    <ExercisePicker
                      exercises={exercises}
                      onPick={(ex) => handleAddEntry(ex)}
                      onCreateAndPick={handleCreateExerciseAndAdd}
                      onSaveExercise={handleSaveExercise}
                      onDeleteExercise={(ex) => confirmDeleteExercise.request(ex)}
                      onClose={() => setShowPicker(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPicker(true)}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                    >
                      <span className="text-base leading-none">+</span> Legg til øvelse
                    </button>
                  )}
                </div>
              ) : showSetup ? (
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Sett opp økt</p>
                  {draftExercises.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {draftExercises.map((ex, i) => (
                        <li
                          key={`${ex.exerciseId}-${i}`}
                          className="flex items-center gap-2 rounded-lg bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1"
                        >
                          <span className="min-w-0 flex-1 truncate">{ex.exerciseName}</span>
                          <button
                            type="button"
                            onClick={() => setDraftExercises((cur) => cur.filter((_, idx) => idx !== i))}
                            aria-label="Fjern øvelse"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3">Ingen øvelser valgt ennå.</p>
                  )}
                  {showSetupPicker ? (
                    <ExercisePicker
                      exercises={exercises}
                      onPick={(ex) => {
                        setDraftExercises((cur) => [...cur, { exerciseId: ex.id, exerciseName: ex.name }]);
                        setShowSetupPicker(false);
                      }}
                      onCreateAndPick={handleCreateExerciseForDraft}
                      onSaveExercise={handleSaveExercise}
                      onDeleteExercise={(ex) => confirmDeleteExercise.request(ex)}
                      onClose={() => setShowSetupPicker(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSetupPicker(true)}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                    >
                      <span className="text-base leading-none">+</span> Legg til øvelse
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSetup(false);
                        setShowSetupPicker(false);
                        setDraftExercises([]);
                      }}
                      className="text-xs font-medium text-ink-4 hover:text-ink-2"
                    >
                      Avbryt
                    </button>
                    <button
                      type="button"
                      onClick={handleSetupStart}
                      disabled={draftExercises.length === 0}
                      className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                    >
                      Start økt
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleStartSession}
                    className="rounded-xl bg-accent-privat px-3 py-3 text-center text-sm font-semibold text-surface-0 transition hover:bg-accent-privat/85"
                  >
                    Start treningsøkt
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSetup(true)}
                    className="rounded-xl border border-dashed border-line px-3 py-2.5 text-center text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                  >
                    Sett opp økt
                  </button>
                  {routines.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Rutiner</p>
                      <ul className="flex flex-col gap-1.5">
                        {routines.map((r) => (
                          <RoutineRow
                            key={r.id}
                            routine={r}
                            editing={editingRoutineId === r.id}
                            onStartEdit={() => setEditingRoutineId(r.id)}
                            onCancelEdit={() => setEditingRoutineId(null)}
                            onSave={(name) => handleRenameRoutine(r.id, name)}
                            onStart={() => handleStartFromRoutine(r)}
                            onDelete={() => confirmDeleteRoutine.request(r)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {pastSessions.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setShowHistory((v) => !v);
                        setVisibleHistoryCount(VISIBLE_HISTORY);
                      }}
                      aria-expanded={showHistory}
                      className="text-2xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink-1"
                    >
                      {showHistory ? "Skjul tidligere økter" : `Tidligere økter (${pastSessions.length})`}
                    </button>
                    <a
                      href="/api/workouts/export"
                      download
                      className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
                    >
                      Eksporter
                    </a>
                  </div>
                  {showHistory && (
                    <>
                      <div className="flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface-1 p-0.5">
                        {(["list", "calendar"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setHistoryView(v)}
                            aria-pressed={historyView === v}
                            className={`rounded-md px-2.5 py-1 text-2xs font-semibold uppercase transition ${
                              historyView === v ? "bg-accent-privat/15 text-accent-privat" : "text-ink-3 hover:text-ink-1"
                            }`}
                          >
                            {v === "list" ? "Liste" : "Kalender"}
                          </button>
                        ))}
                      </div>
                      {historyView === "list" ? (
                        <>
                          <ul className="flex flex-col gap-1.5">
                            {visibleHistory.map((s) => (
                              <HistoryRow
                                key={s.id}
                                session={s}
                                expanded={expandedHistoryId === s.id}
                                editing={editingHistoryId === s.id}
                                onToggle={() => setExpandedHistoryId((v) => (v === s.id ? null : s.id))}
                                onToggleEdit={() => setEditingHistoryId((v) => (v === s.id ? null : s.id))}
                                onDelete={() => confirmDeleteSession.request(s)}
                                editor={
                                  editingHistoryId === s.id ? (
                                    <HistorySessionEditor
                                      session={s}
                                      exercises={exercises}
                                      sessions={sessions}
                                      handlers={sessionEditHandlers(s.id)}
                                      onCreateAndAdd={(name, description, category, bodyweight) =>
                                        handleCreateExerciseAndAddToSession(s.id, name, description, category, bodyweight)
                                      }
                                      onSaveExercise={handleSaveExercise}
                                      onDeleteExercise={(ex) => confirmDeleteExercise.request(ex)}
                                    />
                                  ) : undefined
                                }
                              />
                            ))}
                          </ul>
                          {pastSessions.length > visibleHistoryCount && (
                            <button
                              type="button"
                              onClick={() => setVisibleHistoryCount((v) => v + HISTORY_PAGE_SIZE)}
                              className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                            >
                              {`Mer (${pastSessions.length - visibleHistoryCount})`}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <TrainingCalendar
                            sessionsByDate={sessionsByDate}
                            monthOffset={calendarMonthOffset}
                            onMonthOffsetChange={(offset) => {
                              setCalendarMonthOffset(offset);
                              setSelectedCalendarDate(null);
                            }}
                            selectedDate={selectedCalendarDate}
                            onSelectDate={setSelectedCalendarDate}
                          />
                          {selectedDateSessions.length > 0 && (
                            <ul className="flex flex-col gap-1.5">
                              {selectedDateSessions.map((s) => (
                                <HistoryRow
                                  key={s.id}
                                  session={s}
                                  expanded={expandedHistoryId === s.id}
                                  editing={editingHistoryId === s.id}
                                  onToggle={() => setExpandedHistoryId((v) => (v === s.id ? null : s.id))}
                                  onToggleEdit={() => setEditingHistoryId((v) => (v === s.id ? null : s.id))}
                                  onDelete={() => confirmDeleteSession.request(s)}
                                  editor={
                                    editingHistoryId === s.id ? (
                                      <HistorySessionEditor
                                        session={s}
                                        exercises={exercises}
                                        sessions={sessions}
                                        handlers={sessionEditHandlers(s.id)}
                                        onCreateAndAdd={(name, description, category, bodyweight) =>
                                          handleCreateExerciseAndAddToSession(s.id, name, description, category, bodyweight)
                                        }
                                        onSaveExercise={handleSaveExercise}
                                        onDeleteExercise={(ex) => confirmDeleteExercise.request(ex)}
                                      />
                                    ) : undefined
                                  }
                                />
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      <ConfirmDialog
        open={confirmDeleteSession.isOpen}
        message={
          confirmDeleteSession.pending
            ? `Slette treningsøkten fra ${formatSessionDate(confirmDeleteSession.pending.startedAt)}?`
            : ""
        }
        onCancel={confirmDeleteSession.cancel}
        onConfirm={() => {
          if (confirmDeleteSession.pending) handleDeleteSession(confirmDeleteSession.pending);
          confirmDeleteSession.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmDeleteExercise.isOpen}
        message={confirmDeleteExercise.pending ? `Slette øvelsen «${confirmDeleteExercise.pending.name}»?` : ""}
        onCancel={confirmDeleteExercise.cancel}
        onConfirm={() => {
          if (confirmDeleteExercise.pending) handleDeleteExercise(confirmDeleteExercise.pending);
          confirmDeleteExercise.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmDeleteRoutine.isOpen}
        message={confirmDeleteRoutine.pending ? `Slette rutinen «${confirmDeleteRoutine.pending.name}»?` : ""}
        onCancel={confirmDeleteRoutine.cancel}
        onConfirm={() => {
          if (confirmDeleteRoutine.pending) handleDeleteRoutine(confirmDeleteRoutine.pending);
          confirmDeleteRoutine.cancel();
        }}
      />
      {sessionSummary && <SessionSummaryDialog summary={sessionSummary} onClose={() => setSessionSummary(null)} />}
    </div>
  );
}
