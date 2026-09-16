"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import {
  CardHeader,
  ConfirmDialog,
  MutationError,
  SkeletonRows,
  useConfirmDelete,
  useMutationError,
} from "../CardShell";
import type { Exercise, ExerciseCategory } from "@/lib/exercises";
import type { SetIntensity, WorkoutSession } from "@/lib/workouts";
import type { Routine } from "@/lib/routines";
import { vibrate } from "@/lib/haptics";
import { addDaysIso, localDateString, toOsloDateString, weekRangeContaining } from "@/lib/payday";
import { WeekStrip } from "./DataStrips";
import { Dumbbell, X } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { EntryRow, ExercisePicker, RoutineRow } from "./trening/EntryAndExercises";
import {
  HistoryRow,
  HistorySessionEditor,
  SessionSummaryDialog,
  TrainingCalendar,
  type SessionEditHandlers,
  type SessionSummary,
} from "./trening/HistoryAndCalendar";
import { StepperButton } from "./trening/SetRows";
import RyggSection from "./rygg/RyggSection";
import { RYGG_OPEN_EVENT, consumeOpenRyggView, peekOpenRyggView } from "@/lib/ryggNavigation";
import {
  exerciseHistory,
  findLastEntry,
  formatElapsed,
  formatRest,
  formatSessionDate,
  useElapsed,
  useRestTimer,
} from "./trening/treningHelpers";

const VISIBLE_HISTORY = 5;
const HISTORY_PAGE_SIZE = 5;

const EMPTY_SESSIONS: WorkoutSession[] = [];
const EMPTY_EXERCISES: Exercise[] = [];
const EMPTY_ROUTINES: Routine[] = [];

const DEFAULT_REST_SECONDS = 90;
const REST_ADJUST_SECONDS = 15;

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
  // Starter på "rygg" hvis "I dag"-kortet nettopp ba om det (lib/ryggNavigation.ts) —
  // lest i initializeren, ikke i en effekt, så første render lander riktig uten blink.
  const [mainView, setMainView] = useState<"trening" | "rygg">(() => (peekOpenRyggView() ? "rygg" : "trening"));
  useEffect(() => {
    consumeOpenRyggView();
    const onOpen = () => {
      consumeOpenRyggView();
      setMainView("rygg");
    };
    window.addEventListener(RYGG_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(RYGG_OPEN_EVENT, onOpen);
  }, []);
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
      <div className="mb-2 flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface-1 p-0.5">
        {(["trening", "rygg"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMainView(v)}
            aria-pressed={mainView === v}
            className={`rounded-md px-2.5 py-1 text-2xs font-semibold uppercase transition ${
              mainView === v ? "bg-emerald-400/15 text-emerald-400" : "text-ink-3 hover:text-ink-1"
            }`}
          >
            {v === "trening" ? "Trening" : "Rygg"}
          </button>
        ))}
      </div>
      {mainView === "rygg" && <RyggSection />}
      {mainView === "trening" && (
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
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
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
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
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
      )}
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
