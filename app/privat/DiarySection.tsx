"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "../CardShell";
import type { DiaryEntry } from "@/lib/diary";
import type { DiaryPreset, DiaryPresetCategory } from "@/lib/diaryPresets";
import { addDaysIso, formatDMY, localDateString } from "@/lib/payday";
import { Moon, X } from "lucide-react";

type DraftField = "morning" | "afternoon" | "evening" | "people" | "places";
type Step = DiaryPresetCategory | "notat";

const STEP_ORDER: Step[] = ["morgen", "ettermiddag", "kveld", "personer", "steder", "notat"];

const STEP_QUESTION: Record<DiaryPresetCategory, string> = {
  morgen: "Morgen?",
  ettermiddag: "Ettermiddag?",
  kveld: "Kveld?",
  personer: "Hvem var du sammen med?",
  steder: "Hvor var du?",
};

const CATEGORY_FIELD: Record<DiaryPresetCategory, DraftField> = {
  morgen: "morning",
  ettermiddag: "afternoon",
  kveld: "evening",
  personer: "people",
  steder: "places",
};

interface DiaryDraft {
  morning: string[];
  afternoon: string[];
  evening: string[];
  people: string[];
  places: string[];
  notes: string;
}

const EMPTY_DRAFT: DiaryDraft = { morning: [], afternoon: [], evening: [], people: [], places: [], notes: "" };

function includesLabel(list: string[], label: string): boolean {
  return list.some((l) => l.toLowerCase() === label.toLowerCase());
}

// Delt stegkomponent — brukes for alle 5 spørsmålene (kun ulik i hvilke
// presets/valgt-liste som sendes inn), i stedet for 5 kopier av samme UI.
// Topp 3 (høyest telling) vises alltid, resten bak "Flere valg". Et "+
// Nytt"-felt lar brukeren skrive en helt ny preset — den blir først en ekte
// preset (telt) når hele veiviseren fullføres, se lib/diary.ts.
function DiaryStepPicker({
  presets,
  selected,
  onToggle,
  onDeletePreset,
}: {
  presets: DiaryPreset[];
  selected: string[];
  onToggle: (label: string) => void;
  onDeletePreset: (preset: DiaryPreset) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState("");

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

  function Chip({ label }: { label: string }) {
    const active = includesLabel(selected, label);
    return (
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
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {top3.map((p) => (
          <Chip key={p.id} label={p.label} />
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
                <Chip key={p.id} label={p.label} />
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
      {presets.length > 0 && (
        <div>
          <button type="button" onClick={() => setManaging((v) => !v)} className="text-2xs font-medium text-ink-4 hover:text-ink-2">
            {managing ? "Skjul administrasjon" : "Administrer presets"}
          </button>
          {managing && (
            <ul className="mt-1.5 flex flex-col gap-1 border-l border-line pl-2">
              {presets.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-2">{p.label}</span>
                  <button
                    type="button"
                    onClick={() => onDeletePreset(p)}
                    aria-label={`Slett presetet ${p.label}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EntryTags({ entry }: { entry: DiaryEntry }) {
  const groups: [string, string[]][] = [
    ["Morgen", entry.morning],
    ["Ettermiddag", entry.afternoon],
    ["Kveld", entry.evening],
    ["Sammen med", entry.people],
    ["Steder", entry.places],
  ];
  const visible = groups.filter(([, values]) => values.length > 0);
  return (
    <div className="flex flex-col gap-0.5">
      {visible.map(([label, values]) => (
        <p key={label} className="text-xs text-ink-3">
          <span className="text-ink-4">{label}:</span> {values.join(", ")}
        </p>
      ))}
      {entry.notes && <p className="text-sm text-ink-1">{entry.notes}</p>}
      {visible.length === 0 && !entry.notes && <p className="text-sm text-ink-3">Ingen kryss denne dagen.</p>}
    </div>
  );
}

function DiaryHistory({
  entries,
  onEdit,
  onDelete,
}: {
  entries: DiaryEntry[];
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-ink-3 hover:text-ink-1">
        {open ? "Skjul tidligere dager" : `Tidligere dager (${sorted.length})`}
      </button>
      {open && (
        <>
          <ul className="mt-1.5 flex flex-col gap-2 border-l border-line pl-2.5">
            {sorted.slice(0, visibleCount).map((e) => (
              <li key={e.date} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-xs tabular-nums text-ink-4">{formatDMY(e.date)}</span>
                  <EntryTags entry={e} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => onEdit(e)} className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80">
                    Rediger
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(e.date)}
                    aria-label="Slett dagboksnotat"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {sorted.length > visibleCount && (
            <button type="button" onClick={() => setVisibleCount((v) => v + 10)} className="mt-1.5 text-xs font-medium text-ink-3 hover:text-ink-1">
              Mer ({sorted.length - visibleCount})
            </button>
          )}
        </>
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

  const [wizardDate, setWizardDate] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<DiaryDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const confirmDeleteEntry = useConfirmDelete<string>();
  const confirmDeletePreset = useConfirmDelete<DiaryPreset>();
  const mutationError = useMutationError();

  const today = localDateString();
  const yesterday = addDaysIso(today, -1);
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const yesterdayEntry = entries.find((e) => e.date === yesterday) ?? null;

  function openWizard(date: string, existing: DiaryEntry | null) {
    setDraft(
      existing
        ? {
            morning: existing.morning,
            afternoon: existing.afternoon,
            evening: existing.evening,
            people: existing.people,
            places: existing.places,
            notes: existing.notes ?? "",
          }
        : EMPTY_DRAFT,
    );
    setStepIndex(0);
    setWizardDate(date);
  }

  function closeWizard() {
    setWizardDate(null);
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

  async function handleFinish() {
    if (!wizardDate || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: wizardDate, ...draft, notes: draft.notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error("save failed");
      const saved: DiaryEntry = await res.json();
      mutateEntries(
        (current) => current && { entries: [...current.entries.filter((e) => e.date !== saved.date), saved] },
        { revalidate: false },
      );
      mutatePresets();
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      closeWizard();
    } catch {
      mutationError.show("Kunne ikke lagre dagboken. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleConfirmStep() {
    if (stepIndex === STEP_ORDER.length - 1) {
      handleFinish();
    } else {
      setStepIndex((i) => i + 1);
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

  const currentStep = STEP_ORDER[stepIndex];
  const presetsForStep = currentStep !== "notat" ? presets.filter((p) => p.category === currentStep) : [];

  return (
    <div className="border-t-2 border-t-accent-privat/60 p-4">
      <CardHeader title="Dagbok" icon={Moon} iconColorClass="text-violet-400" />
      <div className="flex flex-col gap-3">
        <MutationError message={mutationError.message} />

        {entriesLoading ? (
          <SkeletonRows count={2} />
        ) : wizardDate ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
              {formatDMY(wizardDate)} · Steg {stepIndex + 1} av {STEP_ORDER.length}
            </p>
            {currentStep === "notat" ? (
              <>
                <p className="text-sm font-medium text-ink-1">Notat (valgfritt)</p>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  placeholder="Notat om dagen..."
                  className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                />
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-ink-1">{STEP_QUESTION[currentStep]}</p>
                <DiaryStepPicker
                  presets={presetsForStep}
                  selected={draft[CATEGORY_FIELD[currentStep]]}
                  onToggle={(label) => toggleDraftValue(CATEGORY_FIELD[currentStep], label)}
                  onDeletePreset={(preset) => confirmDeletePreset.request(preset)}
                />
              </>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={closeWizard} className="text-xs font-medium text-ink-4 hover:text-ink-2">
                Avbryt
              </button>
              {currentStep !== "morgen" && currentStep !== "ettermiddag" && currentStep !== "kveld" && (
                <button type="button" onClick={handleConfirmStep} className="text-xs font-medium text-ink-3 hover:text-ink-1">
                  Hopp over
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmStep}
                disabled={submitting}
                className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
              >
                {stepIndex === STEP_ORDER.length - 1 ? "Fullfør" : "Bekreft"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!yesterdayEntry && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-status-warning/30 bg-status-warning/[0.06] px-3 py-2">
                <p className="text-sm text-status-warning">Du fylte ikke ut dagboken i går ({formatDMY(yesterday)}).</p>
                <button
                  type="button"
                  onClick={() => openWizard(yesterday, null)}
                  className="shrink-0 rounded-lg bg-status-warning/15 px-2.5 py-1 text-2xs font-semibold uppercase text-status-warning transition hover:bg-status-warning/25"
                >
                  Fyll ut
                </button>
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface-2 p-3">
              {todayEntry ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">I dag</p>
                  <EntryTags entry={todayEntry} />
                  <button
                    type="button"
                    onClick={() => openWizard(today, todayEntry)}
                    className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                  >
                    Rediger
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink-3">Ikke fylt ut i dag ennå.</p>
                  <button
                    type="button"
                    onClick={() => openWizard(today, null)}
                    className="shrink-0 rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
                  >
                    Fyll ut nå
                  </button>
                </div>
              )}
            </div>

            <DiaryHistory
              entries={entries.filter((e) => e.date !== today)}
              onEdit={(e) => openWizard(e.date, e)}
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
