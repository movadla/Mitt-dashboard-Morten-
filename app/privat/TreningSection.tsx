"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import {
  CardHeader,
  CollapsibleBody,
  ConfirmDialog,
  MutationError,
  SkeletonRows,
  useConfirmDelete,
  useMutationError,
  usePersistedCollapse,
} from "../CardShell";
import type { Exercise, ExerciseCategory } from "@/lib/exercises";
import type { SetIntensity, SetLog, WorkoutEntry, WorkoutSession } from "@/lib/workouts";
import type { Routine } from "@/lib/routines";
import { vibrate } from "@/lib/haptics";
import { Dumbbell, GripVertical, Pencil, X } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const VISIBLE_HISTORY = 5;
const HISTORY_PAGE_SIZE = 5;

const EMPTY_SESSIONS: WorkoutSession[] = [];
const EMPTY_EXERCISES: Exercise[] = [];
const EMPTY_ROUTINES: Routine[] = [];

const CATEGORY_LABEL: Record<ExerciseCategory, string> = { styrke: "Styrke", cardio: "Cardio" };
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
        done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-line-strong"
      }`}
    >
      {done && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-surface-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5L6.5 12 13 5" />
        </svg>
      )}
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

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function formatKg(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1).replace(/\.0$/, "");
}

// Runder til nærmeste 0,5 kg (vanligste plate-inkrement) for å unngå
// flyttall-artefakter når +/- stepperne justerer vekten.
function roundKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

function setSummary(entry: WorkoutEntry): string {
  return entry.sets
    .map((s) => {
      const parts: string[] = [];
      if (s.kg != null && s.reps != null) parts.push(`${formatKg(s.kg)}kg×${s.reps}`);
      else if (s.kg != null) parts.push(`${formatKg(s.kg)}kg`);
      else if (s.reps != null) parts.push(`${s.reps} reps`);
      if (s.minutes != null) parts.push(`${s.minutes} min`);
      if (s.distanceKm != null) parts.push(`${formatKg(s.distanceKm)} km`);
      if (s.kmt != null) parts.push(`${s.kmt} km/t`);
      if (s.intensity) parts.push(INTENSITY_LABEL[s.intensity]);
      return parts.join(" · ") || null;
    })
    .filter(Boolean)
    .join(", ");
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
}

// De sist brukte øvelsene (nyeste økt først, uansett pågående/avsluttet) —
// vist som hurtigvalg over søkefeltet i øvelsesvelgeren, samme mønster som
// hurtigvalg på handlelisten, slik at man slipper å søke opp de samme faste
// øvelsene hver økt.
function recentlyUsedExercises(exercises: Exercise[], sessions: WorkoutSession[], limit = 6): Exercise[] {
  const seen = new Set<string>();
  const result: Exercise[] = [];
  for (const s of sessions) {
    for (const e of s.entries) {
      if (seen.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      const exercise = exercises.find((ex) => ex.id === e.exerciseId);
      if (exercise) result.push(exercise);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

// Høyeste vekt logget per avsluttet økt for en øvelse, kronologisk (eldst
// først) — "sessions" er nyest-først server-side, så vi snur rekkefølgen.
function exerciseHistory(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): ExerciseHistoryPoint[] {
  const points: ExerciseHistoryPoint[] = [];
  for (const s of sessions) {
    if (s.id === excludeSessionId || !s.endedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) continue;
    const kgValues = entry.sets.map((set) => set.kg).filter((kg): kg is number => kg != null);
    if (kgValues.length === 0) continue;
    points.push({ date: s.startedAt, maxKg: Math.max(...kgValues) });
  }
  return points.reverse();
}

// Enkel innebygd SVG-linjegraf — ingen chart-bibliotek i prosjektet, og en
// håndfull punkter (typisk et titalls økter) trenger ikke noe tyngre enn dette.
function ProgressChart({ points }: { points: ExerciseHistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="text-2xs text-ink-4">Ikke nok data ennå for graf.</p>;
  }

  const width = 260;
  const height = 60;
  const pad = 6;
  const kgValues = points.map((p) => p.maxKg);
  const min = Math.min(...kgValues);
  const max = Math.max(...kgValues);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((p.maxKg - min) / range) * (height - pad * 2);
    return { x, y };
  });

  return (
    <div className="flex flex-col gap-1">
      {/* Rå farge, ikke status-positive — den er reservert ekte suksess-
          /positive-tilstander andre steder i appen (se SportSection.tsx). */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-emerald-400">
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="currentColor" />
        ))}
      </svg>
      <p className="text-2xs text-ink-4">
        {formatKg(min)}–{formatKg(max)} kg siste {points.length} {points.length === 1 ? "økt" : "økter"}
      </p>
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
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink-1 active:scale-95"
    >
      {symbol}
    </button>
  );
}

function SetRowShell({
  index,
  done,
  onToggleDone,
  onRemove,
  children,
}: {
  index: number;
  done: boolean;
  onToggleDone: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border p-2 transition ${
        done ? "border-status-positive/50 bg-status-positive/8" : "border-line bg-surface-1"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <DoneToggle done={done} onToggle={onToggleDone} size="sm" label={done ? "Merk sett som ikke fullført" : "Merk sett som fullført"} />
          <span className="text-2xs text-ink-4">Sett {index + 1}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Slett sett"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function StrengthSetRow({
  set,
  index,
  onUpdate,
  onToggleDone,
  onRemove,
}: {
  set: SetLog;
  index: number;
  onUpdate: (updates: { kg: number | null; reps: number | null }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}) {
  const [kg, setKg] = useState(set.kg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");

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
    <SetRowShell index={index} done={!!set.done} onToggleDone={onToggleDone} onRemove={onRemove}>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser vekt" onClick={() => adjustKg(-2.5)} />
          <input
            type="number"
            step="0.5"
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            onBlur={() => commit(kg, reps)}
            placeholder="Kg"
            className="w-full min-w-0 rounded-lg border border-transparent bg-surface-2 px-1 py-1.5 text-center text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <StepperButton symbol="+" label="Øk vekt" onClick={() => adjustKg(2.5)} />
        </div>
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser reps" onClick={() => adjustReps(-1)} />
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={() => commit(kg, reps)}
            placeholder="Reps"
            className="w-full min-w-0 rounded-lg border border-transparent bg-surface-2 px-1 py-1.5 text-center text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <StepperButton symbol="+" label="Øk reps" onClick={() => adjustReps(1)} />
        </div>
      </div>
    </SetRowShell>
  );
}

function CardioSetRow({
  set,
  index,
  onUpdate,
  onToggleDone,
  onRemove,
}: {
  set: SetLog;
  index: number;
  onUpdate: (updates: { minutes: number | null; kmt: number | null; distanceKm: number | null; intensity: SetIntensity | null }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}) {
  const [minutes, setMinutes] = useState(set.minutes?.toString() ?? "");
  const [kmt, setKmt] = useState(set.kmt?.toString() ?? "");
  const [distanceKm, setDistanceKm] = useState(set.distanceKm?.toString() ?? "");
  const [intensity, setIntensity] = useState<SetIntensity | "">(set.intensity ?? "");
  // Fritekst-feltene committer på blur som ellers i appen, men cardio-settet
  // har i tillegg en egen "Lagre"-knapp — man fyller ofte ut flere felt (min,
  // km/t, distanse, intensitet) før man er ferdig, og en eksplisitt
  // lagre-handling gir en tydelig bekreftelse i stedet for å stole på at
  // blur alene fanget opp alt som ble tastet inn.
  const [dirty, setDirty] = useState(false);

  function commit(nextMinutes: string, nextKmt: string, nextDistanceKm: string, nextIntensity: SetIntensity | "") {
    onUpdate({
      minutes: nextMinutes.trim() ? Number(nextMinutes) : null,
      kmt: nextKmt.trim() ? Number(nextKmt) : null,
      distanceKm: nextDistanceKm.trim() ? Number(nextDistanceKm) : null,
      intensity: nextIntensity || null,
    });
    setDirty(false);
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
    <SetRowShell index={index} done={!!set.done} onToggleDone={onToggleDone} onRemove={onRemove}>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser minutter" onClick={() => adjustMinutes(-1)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                setDirty(true);
              }}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Min"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-2 py-1.5 pl-2 pr-8 text-left text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
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
              onChange={(e) => {
                setKmt(e.target.value);
                setDirty(true);
              }}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Km/t"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-2 py-1.5 pl-2 pr-10 text-left text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
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
              onChange={(e) => {
                setDistanceKm(e.target.value);
                setDirty(true);
              }}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Distanse"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-2 py-1.5 pl-2 pr-8 text-left text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
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
          className="w-full rounded-lg border border-transparent bg-surface-2 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          <option value="">Intensitet...</option>
          {INTENSITY_OPTIONS.map((i) => (
            <option key={i} value={i}>
              {INTENSITY_LABEL[i]}
            </option>
          ))}
        </select>
      </div>
      {dirty && (
        <button
          type="button"
          onClick={() => commit(minutes, kmt, distanceKm, intensity)}
          className="self-end rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
        >
          Lagre
        </button>
      )}
    </SetRowShell>
  );
}

function EntryRow({
  entry,
  lastEntry,
  history,
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
  // til, i stedet for at man må lukke hver og én manuelt.
  const [collapsed, setCollapsed] = useState(true);
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

  const containerClass = `rounded-xl border transition ${
    entry.done ? "border-status-positive/50 bg-status-positive/8" : "border-line bg-surface-2"
  }`;

  if (collapsed) {
    return (
      <li ref={setNodeRef} style={style} className={`${containerClass} p-2.5`}>
        <div className="flex items-center gap-2">
          {gripHandle}
          {doneToggle}
          <button type="button" onClick={() => setCollapsed(false)} aria-expanded={false} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-ink-1">{entry.exerciseName}</p>
          </button>
          <button
            type="button"
            onClick={onRemoveEntry}
            aria-label="Fjern øvelse fra økten"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`${containerClass} flex flex-col gap-2 p-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {gripHandle}
          {doneToggle}
          <button type="button" onClick={() => setCollapsed(true)} aria-expanded={true} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-ink-1">{entry.exerciseName}</p>
          </button>
        </div>
        <button
          type="button"
          onClick={onRemoveEntry}
          aria-label="Fjern øvelse fra økten"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {lastEntry && setSummary(lastEntry) && (
        <p className="text-2xs text-ink-4">Sist: {setSummary(lastEntry)}</p>
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
        <div className="flex flex-col gap-1.5">
          {entry.sets.map((s, i) =>
            entry.category === "cardio" ? (
              <CardioSetRow
                key={s.id}
                set={s}
                index={i}
                onUpdate={(updates) => onUpdateSet(s.id, updates)}
                onToggleDone={() => onToggleSetDone(s.id, !s.done)}
                onRemove={() => onRemoveSet(s.id)}
              />
            ) : (
              <StrengthSetRow
                key={s.id}
                set={s}
                index={i}
                onUpdate={(updates) => onUpdateSet(s.id, updates)}
                onToggleDone={() => onToggleSetDone(s.id, !s.done)}
                onRemove={() => onRemoveSet(s.id)}
              />
            ),
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleAddSetClick}
        className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
      >
        + Nytt sett
      </button>
      {showMore ? (
        <div className="grid grid-cols-2 gap-2">
          {entry.category !== "cardio" && (
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={commitEntry}
              placeholder="Minutter"
              className="w-full rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitEntry}
            placeholder="Notat (valgfritt)"
            className={`w-full rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong ${
              entry.category === "cardio" ? "col-span-2" : ""
            }`}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="self-start text-2xs font-medium text-ink-4 hover:text-ink-2"
        >
          {entry.category === "cardio" ? "+ Notat" : "+ Minutter/notat"}
        </button>
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
  onSave: (updates: { name: string; description?: string; category: ExerciseCategory }) => Promise<boolean>;
}) {
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(exercise.category);
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, category });
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
  recentExercises,
  onPick,
  onCreateAndPick,
  onSaveExercise,
  onDeleteExercise,
  onClose,
}: {
  exercises: Exercise[];
  recentExercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  onCreateAndPick: (name: string, description: string, category: ExerciseCategory) => Promise<boolean>;
  onSaveExercise: (id: string, updates: { name: string; description?: string; category: ExerciseCategory }) => Promise<boolean>;
  onDeleteExercise: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<ExerciseCategory>("styrke");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function handleCreateClick() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const ok = await onCreateAndPick(newName.trim(), newDescription.trim(), newCategory);
      if (ok) {
        setNewName("");
        setNewDescription("");
        setNewCategory("styrke");
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
      {!query.trim() && recentExercises.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Nylig brukt</p>
          <div className="flex flex-wrap gap-1.5">
            {recentExercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => onPick(ex)}
                className="rounded-full border border-line bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink-1 transition hover:border-line-strong hover:bg-surface-3 active:opacity-70"
              >
                {ex.name}
              </button>
            ))}
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
                    <p className="truncate text-sm font-medium text-ink-1">{ex.name}</p>
                    <span className="shrink-0 text-2xs text-ink-4">{CATEGORY_LABEL[ex.category]}</span>
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
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
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
        className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-emerald-500/85"
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
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function HistoryRow({
  session,
  expanded,
  onToggle,
  onDelete,
}: {
  session: WorkoutSession;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
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
        <button
          type="button"
          onClick={onDelete}
          aria-label="Slett økt"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
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
      )}
    </li>
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
          className="mt-4 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-surface-0 transition hover:bg-emerald-500/85"
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

export default function TreningSection({ defaultExpanded = false }: { defaultExpanded?: boolean } = {}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Trening", !defaultExpanded);
  const { data: sessionsData, isLoading: loading, mutate: mutateSessions } = useSWR<{ sessions: WorkoutSession[] }>("/api/workouts", jsonFetcher);
  const { data: exercisesData, mutate: mutateExercises } = useSWR<{ exercises: Exercise[] }>("/api/exercises", jsonFetcher);
  const { data: routinesData, mutate: mutateRoutines } = useSWR<{ routines: Routine[] }>("/api/routines", jsonFetcher);
  const sessions = sessionsData?.sessions ?? EMPTY_SESSIONS;
  const exercises = exercisesData?.exercises ?? EMPTY_EXERCISES;
  const routines = routinesData?.routines ?? EMPTY_ROUTINES;
  const [showPicker, setShowPicker] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(VISIBLE_HISTORY);
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
  const elapsed = useElapsed(activeSession?.startedAt);
  const recentExercises = recentlyUsedExercises(exercises, sessions);
  // Sannsynligvis glemt å avslutte økten hvis den har vart urimelig lenge —
  // vi har sett dette skje i praksis under testing av denne seksjonen.
  const isLongSession = !!activeSession && elapsed > 3 * 60 * 60 * 1000;

  async function handleStartSession() {
    if (collapsed) toggleCollapsed();
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

  async function handleStartFromRoutine(routine: Routine) {
    if (collapsed) toggleCollapsed();
    try {
      const res = await fetch("/api/workouts", { method: "POST" });
      if (!res.ok) throw new Error("start failed");
      const started: WorkoutSession = await res.json();
      mutateSessions((current) => {
        if (!current) return current;
        const exists = current.sessions.some((s) => s.id === started.id);
        return { sessions: exists ? current.sessions.map((s) => (s.id === started.id ? started : s)) : [started, ...current.sessions] };
      }, { revalidate: false });
      const { session: seeded, failedCount } = await seedRoutineEntries(started.id, routine.exercises);
      if (seeded) {
        mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === seeded.id ? seeded : s)) }, { revalidate: false });
      }
      if (failedCount > 0) {
        mutationError.show(`Klarte ikke å legge til ${failedCount} ${failedCount === 1 ? "øvelse" : "øvelser"} fra rutinen. Legg dem til manuelt.`);
      }
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke starte økten fra rutinen. Prøv igjen.");
    }
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
      // Lukk øvelsesvelgeren igjen etter valg/opprettelse — skjermen går
      // tilbake til kun "+ Legg til øvelse", i stedet for at søk/opprett-
      // panelet blir stående åpent (samme for begge kall-veiene, siden
      // handleCreateExerciseAndAdd selv kaller denne funksjonen under).
      setShowPicker(false);
    } catch {
      mutationError.show("Kunne ikke legge til øvelsen. Prøv igjen.");
    }
  }

  async function handleCreateExerciseAndAdd(name: string, description: string, category: ExerciseCategory): Promise<boolean> {
    if (!name.trim()) return false;
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, category }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke opprette øvelsen. Prøv igjen.");
        return false;
      }
      const created: Exercise = await res.json();
      mutateExercises(
        (current) => current && { exercises: [...current.exercises, created].sort((a, b) => a.name.localeCompare(b.name, "nb")) },
        { revalidate: false },
      );
      await handleAddEntry(created);
      return true;
    } catch {
      mutationError.show("Kunne ikke opprette øvelsen. Prøv igjen.");
      return false;
    }
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
    try {
      const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error("toggle set failed");
      const updated: WorkoutSession = await res.json();
      mutateSessions((current) => current && { sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)) }, { revalidate: false });
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

  async function handleSaveExercise(id: string, updates: { name: string; description?: string; category: ExerciseCategory }): Promise<boolean> {
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
        subtitle={activeSession ? formatElapsed(elapsed) : pastSessions.length > 0 ? `${pastSessions.length} økter` : "Ingen økter"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Dumbbell}
        iconColorClass="text-emerald-400"
        alwaysShowSubtitle={!!activeSession}
      />
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-2">
          <MutationError message={mutationError.message} />
          {loading ? (
            <SkeletonRows count={2} />
          ) : (
            <>
              {activeSession ? (
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
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
                        className="rounded-lg bg-rose-500 px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-rose-500/85"
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
                      recentExercises={recentExercises}
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
                  {activeSession.entries.length > 3 && (
                    <button
                      type="button"
                      onClick={handleEndSession}
                      className="rounded-lg bg-rose-500 px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-rose-500/85"
                    >
                      Avslutt økt
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleStartSession}
                    className="rounded-xl bg-emerald-500 px-3 py-3 text-center text-sm font-semibold text-surface-0 transition hover:bg-emerald-500/85"
                  >
                    Start treningsøkt
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
                      <ul className="flex flex-col gap-1.5">
                        {visibleHistory.map((s) => (
                          <HistoryRow
                            key={s.id}
                            session={s}
                            expanded={expandedHistoryId === s.id}
                            onToggle={() => setExpandedHistoryId((v) => (v === s.id ? null : s.id))}
                            onDelete={() => confirmDeleteSession.request(s)}
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
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleBody>
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
