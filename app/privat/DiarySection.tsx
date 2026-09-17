"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "../CardShell";
import type { DiaryEntry } from "@/lib/diary";
import type { DiaryPreset, DiaryPresetCategory } from "@/lib/diaryPresets";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import type { Reminder } from "@/lib/reminders";
import type { WorkoutSession } from "@/lib/workouts";
import type { RyggSessionLog } from "@/lib/ryggLog";
import { addDaysIso, formatDMY, localDateString, weekRangeContaining } from "@/lib/payday";
import { WeekStrip } from "./DataStrips";
import { SECTION_ACCENT } from "./sectionAccents";
import SwipeableRow from "./SwipeableRow";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Bell, Calendar, ChevronDown, Dumbbell, Footprints, ImagePlus, Moon, X } from "lucide-react";

type DraftField = "people" | "places";

const QUESTION: Record<DiaryPresetCategory, string> = {
  personer: "Hvem møtte du i dag?",
  steder: "Hvor var du?",
};

const FIELD_OF: Record<DiaryPresetCategory, DraftField> = {
  personer: "people",
  steder: "places",
};

interface DiaryDraft {
  people: string[];
  places: string[];
  notes: string;
  steps: string;
  photoUrl: string;
}

const EMPTY_DRAFT: DiaryDraft = { people: [], places: [], notes: "", steps: "", photoUrl: "" };

// Klienten skalerer ned før opplasting — et råbilde fra telefonen er 3-5 MB,
// mens 1600px/JPEG-0.8 lander på ~200-400 kB uten synlig tap i en dagbok.
const MAX_PHOTO_EDGE = 1600;

function includesLabel(list: string[], label: string): boolean {
  return list.some((l) => l.toLowerCase() === label.toLowerCase());
}

function shortWeekdayLabel(dateIso: string): string {
  const weekday = new Date(dateIso + "T12:00:00").toLocaleDateString("nb-NO", { weekday: "short" }).replace(".", "");
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

function formatSteps(steps: number): string {
  return steps.toLocaleString("nb-NO");
}

async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.8));
}

// Delt pille-velger for begge spørsmålene (kun ulik i hvilke presets/valgt-
// liste som sendes inn). Topp 3 (høyest telling) vises alltid, resten bak
// "Flere valg". Et "+ Nytt"-felt lar brukeren skrive en helt ny preset — den
// blir først en ekte preset (telt) når dagen lagres, se lib/diary.ts. Hold
// inne en pille (long-press, håndtert av Base UI sin ContextMenu) for å
// redigere/slette den, i stedet for en separat administrasjons-liste.
function DiaryPicker({
  presets,
  selected,
  onToggle,
  onDeletePreset,
  onRenamePreset,
}: {
  presets: DiaryPreset[];
  selected: string[];
  onToggle: (label: string) => void;
  onDeletePreset: (preset: DiaryPreset) => void;
  onRenamePreset: (preset: DiaryPreset, newLabel: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const top3 = presets.slice(0, 3);
  const rest = presets.slice(3);
  // Valgte labels som ikke (lenger) finnes i preset-listen — f.eks. en helt
  // ny, nettopp skrevet inn tekst — må fortsatt vises som en valgt chip.
  const extraSelected = selected.filter((s) => !presets.some((p) => p.label.toLowerCase() === s.toLowerCase()));

  function submitNew() {
    if (!newLabel.trim()) return;
    onToggle(newLabel.trim());
    setNewLabel("");
  }

  function submitRename() {
    const preset = presets.find((p) => p.id === renamingId);
    if (preset && renameValue.trim()) onRenamePreset(preset, renameValue.trim());
    setRenamingId(null);
  }

  function Chip({ label, preset }: { label: string; preset?: DiaryPreset }) {
    const active = includesLabel(selected, label);
    const button = (
      <button
        type="button"
        onClick={() => onToggle(label)}
        aria-pressed={active}
        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "border-accent-privat/40 bg-accent-privat/15 text-accent-privat"
            : "border-line text-ink-2 hover:border-line-strong hover:text-ink-1"
        }`}
      >
        {label}
      </button>
    );
    if (!preset) return button;
    return (
      <ContextMenu>
        <ContextMenuTrigger>{button}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              setRenamingId(preset.id);
              setRenameValue(preset.label);
            }}
          >
            Rediger
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => onDeletePreset(preset)}>
            Slett
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {renamingId && (
        <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1 p-2">
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setRenamingId(null);
            }}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-2 px-2 py-1 text-sm text-ink-1 outline-none focus:border-line-strong"
          />
          <button type="button" onClick={() => setRenamingId(null)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={submitRename}
            className="rounded-lg bg-accent-privat px-2.5 py-1 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
          >
            Lagre
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {top3.map((p) => (
          <Chip key={p.id} label={p.label} preset={p} />
        ))}
        {extraSelected.map((label) => (
          <Chip key={label} label={label} />
        ))}
      </div>
      {rest.length > 0 && (
        <>
          {showAll && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-2">
              {rest.map((p) => (
                <Chip key={p.id} label={p.label} preset={p} />
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-xs font-medium text-ink-3 hover:text-ink-1">
            {showAll ? "Vis færre" : `Flere valg (${rest.length})`}
          </button>
        </>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
          }}
          placeholder="+ Nytt..."
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button
          type="button"
          onClick={submitNew}
          disabled={!newLabel.trim()}
          className="shrink-0 rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Legg til
        </button>
      </div>
    </div>
  );
}

// Automatisk hentet dagslogg: det man ALLEREDE har registrert andre steder i
// appen skal ikke måtte skrives inn på nytt i dagboken (jf. tilbakemelding).
// Rent lesende, og gjenbruker de samme SWR-nøklene som seksjonene selv — så
// dette koster ingen ekstra nettverkskall.
function DayActivity({ date }: { date: string }) {
  const { data: calendarData } = useSWR<{ events: PrivatCalendarEvent[] }>("/api/privat-calendar", jsonFetcher);
  const { data: remindersData } = useSWR<{ reminders: Reminder[] }>("/api/reminders", jsonFetcher);
  const { data: workoutsData } = useSWR<{ sessions: WorkoutSession[] }>("/api/workouts", jsonFetcher);
  const { data: ryggData } = useSWR<{ logs: RyggSessionLog[] }>("/api/rygg/sessions", jsonFetcher);

  const events = (calendarData?.events ?? []).filter((e) => e.date === date);
  // Påminnelser regnes med når de ble KRYSSET AV den dagen — det er da de
  // faktisk ble gjort. En påminnelse med frist samme dag som fortsatt står
  // åpen hører hjemme i Påminnelser, ikke i dagsloggen.
  const doneReminders = (remindersData?.reminders ?? []).filter((r) => r.done && r.completedAt?.slice(0, 10) === date);
  const workouts = (workoutsData?.sessions ?? []).filter((s) => s.startedAt.slice(0, 10) === date);
  const ryggSessions = (ryggData?.logs ?? []).filter((s) => s.completed && s.date === date);

  const rows: { icon: typeof Calendar; color: string; text: string }[] = [
    ...events.map((e) => ({
      icon: Calendar,
      color: SECTION_ACCENT.calendar,
      text: `${e.startTime ? `${e.startTime} · ` : ""}${e.title}${e.done ? " ✓" : ""}`,
    })),
    ...workouts.map((s) => ({
      icon: Dumbbell,
      color: SECTION_ACCENT.trening,
      text:
        s.entries.length > 0
          ? `Trening: ${s.entries.map((en) => en.exerciseName).join(", ")}`
          : "Trening",
    })),
    ...ryggSessions.map((s) => ({
      icon: Dumbbell,
      color: SECTION_ACCENT.trening,
      text: `Ryggøkt (uke ${s.week}, tyngde ${s.rpe}/10)`,
    })),
    ...doneReminders.map((r) => ({ icon: Bell, color: SECTION_ACCENT.reminders, text: r.text })),
  ];

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-2 p-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Dette skjedde denne dagen</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-4">Ingenting registrert i kalender, trening eller påminnelser.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row, i) => {
            const Icon = row.icon;
            return (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${row.color}`} />
                <span className="min-w-0 flex-1">{row.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EntryBody({ entry }: { entry: DiaryEntry }) {
  const groups: [string, string[]][] = [
    ["Møtte", entry.people],
    ["Steder", entry.places],
  ];
  const visible = groups.filter(([, values]) => values.length > 0);
  const empty = visible.length === 0 && !entry.notes && entry.steps === undefined && !entry.photoUrl;
  return (
    <div className="flex flex-col gap-1">
      {visible.map(([label, values]) => (
        <p key={label} className="text-xs text-ink-3">
          <span className="text-ink-4">{label}:</span> {values.join(", ")}
        </p>
      ))}
      {entry.steps !== undefined && (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Footprints className="h-3.5 w-3.5 shrink-0 text-ink-4" />
          {formatSteps(entry.steps)} skritt
        </p>
      )}
      {entry.notes && <p className="whitespace-pre-line text-sm text-ink-1">{entry.notes}</p>}
      {entry.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.photoUrl} alt="" className="mt-1 max-h-48 w-full rounded-lg object-cover" />
      )}
      {empty && <p className="text-sm text-ink-3">Ingenting fylt ut denne dagen.</p>}
    </div>
  );
}

function DiaryHistoryRow({ entry, onEdit, onDelete }: { entry: DiaryEntry; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const summary = [
    entry.people.length > 0 ? `${entry.people.length} møtt` : null,
    entry.places.length > 0 ? entry.places.join(", ") : null,
    entry.steps !== undefined ? `${formatSteps(entry.steps)} skritt` : null,
    entry.notes ? "notat" : null,
    entry.photoUrl ? "bilde" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-b border-line last:border-0">
      {/* Sveip venstre = slett, samme gest som Handleliste/Kalender — den
          eksisterende "Slett"-knappen i drilldownen beholdes, sveipet er et
          tillegg og aldri eneste vei. */}
      <SwipeableRow onSwipeLeft={onDelete} leftLabel="Slett">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 py-2 text-left">
          <span className="w-9 shrink-0 text-xs font-semibold uppercase text-ink-3">{shortWeekdayLabel(entry.date)}</span>
          <span className="w-14 shrink-0 text-xs tabular-nums text-ink-4">{formatDMY(entry.date)}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{summary || "Ingenting fylt ut"}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </SwipeableRow>
      {open && (
        <div className="flex flex-col gap-2 pb-2 pl-[4.75rem]">
          <EntryBody entry={entry} />
          <DayActivity date={entry.date} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={onEdit} className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80">
              Rediger
            </button>
            <button type="button" onClick={onDelete} className="text-2xs font-medium text-ink-4 hover:text-rose-400">
              Slett
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function DiaryHistoryTable({
  entries,
  onEdit,
  onDelete,
}: {
  entries: DiaryEntry[];
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (date: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(7);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mt-1">
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-4">Historikk</p>
      <ul className="flex flex-col">
        {sorted.slice(0, visibleCount).map((e) => (
          <DiaryHistoryRow key={e.date} entry={e} onEdit={() => onEdit(e)} onDelete={() => onDelete(e.date)} />
        ))}
      </ul>
      {sorted.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount((v) => v + 10)} className="mt-1.5 text-xs font-medium text-ink-3 hover:text-ink-1">
          Mer ({sorted.length - visibleCount})
        </button>
      )}
    </div>
  );
}

export default function DiarySection() {
  const { data: entriesData, isLoading: entriesLoading, mutate: mutateEntries } = useSWR<{ entries: DiaryEntry[] }>(
    "/api/diary",
    jsonFetcher,
  );
  const { data: presetsData, mutate: mutatePresets } = useSWR<{ presets: DiaryPreset[] }>("/api/diary-presets", jsonFetcher);
  const entries = entriesData?.entries ?? [];
  const presets = presetsData?.presets ?? [];

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<DiaryDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const confirmDeleteEntry = useConfirmDelete<string>();
  const confirmDeletePreset = useConfirmDelete<DiaryPreset>();
  const mutationError = useMutationError();

  const today = localDateString();
  const yesterday = addDaysIso(today, -1);
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const yesterdayEntry = entries.find((e) => e.date === yesterday) ?? null;

  // Nøkkeltallet er dager på rad, ikke antall notater totalt — det er rekken
  // som faktisk sier noe om hvordan det går nå. I dag teller bare hvis den ER
  // fylt ut; ellers regnes rekken fra i går, slik at streken ikke brytes midt
  // på dagen mens man fortsatt har tid til å fylle ut.
  const filledDates = new Set(entries.map((e) => e.date));
  let streak = 0;
  let streakCursor = filledDates.has(today) ? today : yesterday;
  while (filledDates.has(streakCursor)) {
    streak++;
    streakCursor = addDaysIso(streakCursor, -1);
  }

  const { start: weekStart } = weekRangeContaining(today);
  const weekDayIsos = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const weekFilledDays = weekDayIsos.map((d) => filledDates.has(d));
  const weekTodayIndex = weekDayIsos.indexOf(today);
  const filledThisWeek = weekFilledDays.filter(Boolean).length;

  function openEditor(date: string, existing: DiaryEntry | null) {
    setDraft(
      existing
        ? {
            people: existing.people,
            places: existing.places,
            notes: existing.notes ?? "",
            steps: existing.steps !== undefined ? String(existing.steps) : "",
            photoUrl: existing.photoUrl ?? "",
          }
        : EMPTY_DRAFT,
    );
    setEditingDate(date);
  }

  function toggleDraftValue(field: DraftField, label: string) {
    setDraft((d) => {
      const list = d[field];
      return {
        ...d,
        [field]: includesLabel(list, label) ? list.filter((l) => l.toLowerCase() !== label.toLowerCase()) : [...list, label],
      };
    });
  }

  async function handlePhotoChange(file: File) {
    if (!editingDate) return;
    setUploading(true);
    try {
      const blob = await downscaleImage(file);
      const form = new FormData();
      form.append("file", blob, "dagbok.jpg");
      form.append("date", editingDate);
      const res = await fetch("/api/diary/photo", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "upload failed");
      }
      const { url } = (await res.json()) as { url: string };
      setDraft((d) => ({ ...d, photoUrl: url }));
    } catch (err) {
      mutationError.show(err instanceof Error ? err.message : "Kunne ikke laste opp bildet. Prøv igjen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!editingDate || submitting) return;
    setSubmitting(true);
    try {
      const trimmedSteps = draft.steps.trim();
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editingDate,
          people: draft.people,
          places: draft.places,
          notes: draft.notes.trim() || undefined,
          steps: trimmedSteps ? Number(trimmedSteps.replace(/\s/g, "")) : null,
          photoUrl: draft.photoUrl || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const saved: DiaryEntry = await res.json();
      mutateEntries(
        (current) => current && { entries: [...current.entries.filter((e) => e.date !== saved.date), saved] },
        { revalidate: false },
      );
      mutatePresets();
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      setEditingDate(null);
    } catch {
      mutationError.show("Kunne ikke lagre dagboken. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEntry(date: string) {
    let previous: DiaryEntry[] = [];
    mutateEntries(
      (current) => {
        previous = current?.entries ?? [];
        return current && { entries: current.entries.filter((e) => e.date !== date) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/diary/${date}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      if (editingDate === date) setEditingDate(null);
    } catch {
      mutateEntries({ entries: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette dagboksnotatet. Prøv igjen.");
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      const res = await fetch(`/api/diary-presets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      mutatePresets((current) => current && { presets: current.presets.filter((p) => p.id !== id) }, { revalidate: false });
    } catch {
      mutationError.show("Kunne ikke slette presetet. Prøv igjen.");
    }
  }

  async function handleRenamePreset(preset: DiaryPreset, newLabel: string) {
    try {
      const res = await fetch(`/api/diary-presets/${preset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel }),
      });
      if (!res.ok) throw new Error("rename failed");
      const updated: DiaryPreset = await res.json();
      mutatePresets(
        (current) => current && { presets: current.presets.map((p) => (p.id === updated.id ? updated : p)) },
        { revalidate: false },
      );
      // Oppdater eventuelt allerede valgte labels i utkastet som matcher det
      // GAMLE navnet, slik at pillen i det åpne skjemaet speiler endringen
      // med det samme i stedet for å vise en foreldet duplikat-tekst.
      setDraft((d) => {
        const replace = (list: string[]) => list.map((l) => (l.toLowerCase() === preset.label.toLowerCase() ? updated.label : l));
        return { ...d, people: replace(d.people), places: replace(d.places) };
      });
    } catch {
      mutationError.show("Kunne ikke endre presetet. Prøv igjen.");
    }
  }

  function renderQuestion(category: DiaryPresetCategory) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-ink-1">{QUESTION[category]}</p>
        <DiaryPicker
          presets={presets.filter((p) => p.category === category)}
          selected={draft[FIELD_OF[category]]}
          onToggle={(label) => toggleDraftValue(FIELD_OF[category], label)}
          onDeletePreset={(preset) => confirmDeletePreset.request(preset)}
          onRenamePreset={handleRenamePreset}
        />
      </div>
    );
  }

  return (
    // Topplinjen må matche SECTION_ACCENT.diary (se ./sectionAccents.ts) —
    // Tailwind kan ikke bygge klassenavnet fra en variabel i runtime.
    <div className="border-t-2 border-t-violet-400/60 p-4">
      <CardHeader
        title="Dagbok"
        stat={{ value: streak, label: streak === 1 ? "dag på rad" : "dager på rad" }}
        icon={Moon}
        iconColorClass={SECTION_ACCENT.diary}
      />
      <div className="flex flex-col gap-3">
        <MutationError message={mutationError.message} />

        {!entriesLoading && (
          <WeekStrip
            activeDays={weekFilledDays}
            todayIndex={weekTodayIndex === -1 ? null : weekTodayIndex}
            colorClass={SECTION_ACCENT.diary}
            label={`${filledThisWeek} av 7 dager fylt ut denne uken`}
          />
        )}

        {entriesLoading ? (
          <SkeletonRows count={2} />
        ) : editingDate ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
                {editingDate === today ? "I dag" : shortWeekdayLabel(editingDate)} · {formatDMY(editingDate)}
              </p>
              <button type="button" onClick={() => setEditingDate(null)} className="text-2xs text-ink-4 hover:text-ink-2">
                Lukk
              </button>
            </div>

            {renderQuestion("personer")}
            {renderQuestion("steder")}

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-ink-1">Notater</p>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={3}
                placeholder="Hva skjedde i dag?"
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Footprints className="h-4 w-4 shrink-0 text-ink-4" />
                <input
                  type="number"
                  inputMode="numeric"
                  value={draft.steps}
                  onChange={(e) => setDraft((d) => ({ ...d, steps: e.target.value }))}
                  placeholder="Skritt"
                  className="w-32 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm tabular-nums text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-2xs font-semibold uppercase text-ink-3 transition hover:border-line-strong hover:text-ink-1">
                <ImagePlus className="h-3.5 w-3.5" />
                {uploading ? "Laster opp…" : draft.photoUrl ? "Bytt bilde" : "Legg til bilde"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoChange(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-2xs text-ink-4">Skritt leses av manuelt fra Garmin Connect.</p>

            {draft.photoUrl && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.photoUrl} alt="" className="max-h-56 w-full rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, photoUrl: "" }))}
                  aria-label="Fjern bildet"
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-surface-0/70 text-ink-1 transition hover:text-rose-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <DayActivity date={editingDate} />

            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="w-full rounded-xl bg-accent-privat px-4 py-2.5 text-sm font-semibold text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
            >
              Lagre
            </button>
          </div>
        ) : (
          <>
            {/* Påminnelsen om i går gir bare mening når dagboken er i bruk — i en
                helt tom dagbok ville den kollidert med forklaringsteksten
                under og lest som en anklage for noe man aldri har begynt på. */}
            {!yesterdayEntry && entries.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-status-warning/30 bg-status-warning/[0.06] px-3 py-2">
                <p className="text-sm text-status-warning">Du fylte ikke ut dagboken i går ({formatDMY(yesterday)}).</p>
                <button
                  type="button"
                  onClick={() => openEditor(yesterday, null)}
                  className="shrink-0 rounded-lg bg-status-warning/15 px-2.5 py-1 text-2xs font-semibold uppercase text-status-warning transition hover:bg-status-warning/25"
                >
                  Fyll ut
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
              {todayEntry ? (
                <>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">I dag</p>
                  <EntryBody entry={todayEntry} />
                  <button
                    type="button"
                    onClick={() => openEditor(today, todayEntry)}
                    className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                  >
                    Rediger
                  </button>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink-3">
                    {entries.length === 0
                      ? "Dagboken samler hvem du møtte, hvor du var og et notat — sammen med det som allerede står i kalender, trening og påminnelser."
                      : "Ikke fylt ut i dag ennå."}
                  </p>
                  <button
                    type="button"
                    onClick={() => openEditor(today, null)}
                    className="shrink-0 rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
                  >
                    Fyll ut nå
                  </button>
                </div>
              )}
            </div>

            <DayActivity date={today} />

            <DiaryHistoryTable
              entries={entries.filter((e) => e.date !== today)}
              onEdit={(e) => openEditor(e.date, e)}
              onDelete={(date) => confirmDeleteEntry.request(date)}
            />
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDeleteEntry.isOpen}
        message={`Slette dagboksnotatet for ${confirmDeleteEntry.pending ? formatDMY(confirmDeleteEntry.pending) : ""}?`}
        onCancel={confirmDeleteEntry.cancel}
        onConfirm={() => {
          handleDeleteEntry(confirmDeleteEntry.pending!);
          confirmDeleteEntry.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmDeletePreset.isOpen}
        message={confirmDeletePreset.pending ? `Slette presetet «${confirmDeletePreset.pending.label}»?` : ""}
        onCancel={confirmDeletePreset.cancel}
        onConfirm={() => {
          if (confirmDeletePreset.pending) handleDeletePreset(confirmDeletePreset.pending.id);
          confirmDeletePreset.cancel();
        }}
      />
    </div>
  );
}
