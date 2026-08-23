"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "../CardShell";
import type { DiaryEntry } from "@/lib/diary";
import type { DiaryPreset, DiaryPresetCategory } from "@/lib/diaryPresets";
import type { DiarySettings } from "@/lib/diarySettings";
import { addDaysIso, formatDMY, localDateString } from "@/lib/payday";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Moon, Settings } from "lucide-react";

type DraftField = "morning" | "afternoon" | "evening" | "people" | "places";
type Step = DiaryPresetCategory | "notat";
type WizardMode = "sequential" | "fields";

const STEP_ORDER: Step[] = ["morgen", "ettermiddag", "kveld", "personer", "steder", "notat"];

const STEP_QUESTION: Record<DiaryPresetCategory, string> = {
  morgen: "Morgen?",
  ettermiddag: "Ettermiddag?",
  kveld: "Kveld?",
  personer: "Hvem var du sammen med?",
  steder: "Hvor var du?",
};

const STEP_TITLE: Record<Step, string> = {
  morgen: "Morgen",
  ettermiddag: "Ettermiddag",
  kveld: "Kveld",
  personer: "Sammen med",
  steder: "Steder",
  notat: "Notat",
};

const CATEGORY_FIELD: Record<DiaryPresetCategory, DraftField> = {
  morgen: "morning",
  ettermiddag: "afternoon",
  kveld: "evening",
  personer: "people",
  steder: "places",
};

const PERIOD_LABEL: Record<"morgen" | "ettermiddag" | "kveld", string> = {
  morgen: "Morgen",
  ettermiddag: "Ettermiddag",
  kveld: "Kveld",
};

const FALLBACK_SETTINGS: DiarySettings = {
  morgen: { from: "00:00", to: "10:59" },
  ettermiddag: { from: "11:00", to: "16:59" },
  kveld: { from: "17:00", to: "23:59" },
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

function isDayPart(step: Step): step is "morgen" | "ettermiddag" | "kveld" {
  return step === "morgen" || step === "ettermiddag" || step === "kveld";
}

function fieldSummary(step: Step, draft: DiaryDraft): string {
  if (step === "notat") return draft.notes.trim() || "Ingen tekst";
  const values = draft[CATEGORY_FIELD[step]];
  return values.length > 0 ? values.join(", ") : "Ingen valgt";
}

function shortWeekdayLabel(dateIso: string): string {
  const weekday = new Date(dateIso + "T12:00:00").toLocaleDateString("nb-NO", { weekday: "short" }).replace(".", "");
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

// Delt stegkomponent — brukes for alle 5 spørsmålene (kun ulik i hvilke
// presets/valgt-liste som sendes inn), i stedet for 5 kopier av samme UI.
// Topp 3 (høyest telling) vises alltid, resten bak "Flere valg". Et "+
// Nytt"-felt lar brukeren skrive en helt ny preset — den blir først en ekte
// preset (telt) når hele veiviseren fullføres, se lib/diary.ts. Hold inne en
// pille (long-press, håndtert av Base UI sin ContextMenu — se
// components/ui/context-menu.tsx) for å redigere/slette den, i stedet for en
// separat administrasjons-liste.
function DiaryStepPicker({
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

  function startRename(preset: DiaryPreset) {
    setRenamingId(preset.id);
    setRenameValue(preset.label);
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
          <ContextMenuItem onClick={() => startRename(preset)}>Rediger</ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => onDeletePreset(preset)}>
            Slett
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
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
      {presets.length > 0 && <p className="text-2xs text-ink-4">Hold inne en pille for å redigere eller slette den.</p>}
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

// Rad i historikk-tabellen — dag/dato i faste, oppstilte kolonner til venstre,
// klikk utvider en inline drilldown (samme lokale open-state-mønster som
// SportRoundLine i TodaySummary.tsx).
function DiaryHistoryRow({ entry, onEdit, onDelete }: { entry: DiaryEntry; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const totalCount = entry.morning.length + entry.afternoon.length + entry.evening.length + entry.people.length + entry.places.length;
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 py-2 text-left">
        <span className="w-9 shrink-0 text-xs font-semibold uppercase text-ink-3">{shortWeekdayLabel(entry.date)}</span>
        <span className="w-14 shrink-0 text-xs tabular-nums text-ink-4">{formatDMY(entry.date)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
          {totalCount > 0 ? `${totalCount} valg` : "Ingen kryss"}
          {entry.notes ? " · notat" : ""}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pb-2 pl-[4.75rem]">
          <EntryTags entry={entry} />
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
  const { data: settingsData, mutate: mutateSettings } = useSWR<DiarySettings>("/api/diary-settings", jsonFetcher);
  const entries = entriesData?.entries ?? [];
  const presets = presetsData?.presets ?? [];
  const settings = settingsData ?? FALLBACK_SETTINGS;

  const [wizardDate, setWizardDate] = useState<string | null>(null);
  const [wizardMode, setWizardMode] = useState<WizardMode>("sequential");
  const [stepIndex, setStepIndex] = useState(0);
  const [fieldEditing, setFieldEditing] = useState<Step | null>(null);
  const [fieldSnapshot, setFieldSnapshot] = useState<string[] | string | null>(null);
  const [draft, setDraft] = useState<DiaryDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<DiarySettings>(FALLBACK_SETTINGS);
  const confirmDeleteEntry = useConfirmDelete<string>();
  const confirmDeletePreset = useConfirmDelete<DiaryPreset>();
  const mutationError = useMutationError();

  const today = localDateString();
  const yesterday = addDaysIso(today, -1);
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const yesterdayEntry = entries.find((e) => e.date === yesterday) ?? null;

  function draftFromEntry(existing: DiaryEntry | null): DiaryDraft {
    return existing
      ? {
          morning: existing.morning,
          afternoon: existing.afternoon,
          evening: existing.evening,
          people: existing.people,
          places: existing.places,
          notes: existing.notes ?? "",
        }
      : EMPTY_DRAFT;
  }

  // Ny dag ("Fyll ut nå") -> vanlig sekvensiell steg-for-steg-flyt.
  // Eksisterende dag ("Rediger") -> velg-felt-modus, se pkt. 1 i planen: man
  // skal kunne hoppe rett til ETT spørsmål i stedet for å gå gjennom alle.
  function openWizard(date: string, existing: DiaryEntry | null) {
    setDraft(draftFromEntry(existing));
    if (existing) {
      setWizardMode("fields");
      setFieldEditing(null);
    } else {
      setWizardMode("sequential");
      setStepIndex(0);
    }
    setWizardDate(date);
  }

  function closeWizard() {
    setWizardDate(null);
    setFieldEditing(null);
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

  async function persistDraft(): Promise<boolean> {
    if (!wizardDate || submitting) return false;
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
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre dagboken. Prøv igjen.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    if (await persistDraft()) closeWizard();
  }

  function handleConfirmStep() {
    if (stepIndex === STEP_ORDER.length - 1) {
      handleFinish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function startEditField(step: Step) {
    setFieldSnapshot(step === "notat" ? draft.notes : draft[CATEGORY_FIELD[step]]);
    setFieldEditing(step);
  }

  function cancelFieldEdit() {
    if (fieldEditing && fieldSnapshot !== null) {
      if (fieldEditing === "notat") setDraft((d) => ({ ...d, notes: fieldSnapshot as string }));
      else setDraft((d) => ({ ...d, [CATEGORY_FIELD[fieldEditing]]: fieldSnapshot as string[] }));
    }
    setFieldEditing(null);
  }

  async function saveFieldEdit() {
    if (await persistDraft()) setFieldEditing(null);
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
      if (wizardDate === date) closeWizard();
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
      // GAMLE navnet, slik at pillen i den åpne veiviseren speiler endringen
      // med det samme i stedet for å vise en foreldet duplikat-tekst.
      setDraft((d) => {
        const replace = (list: string[]) => list.map((l) => (l.toLowerCase() === preset.label.toLowerCase() ? updated.label : l));
        return { ...d, morning: replace(d.morning), afternoon: replace(d.afternoon), evening: replace(d.evening), people: replace(d.people), places: replace(d.places) };
      });
    } catch {
      mutationError.show("Kunne ikke endre presetet. Prøv igjen.");
    }
  }

  function openSettings() {
    setSettingsDraft(settings);
    setSettingsOpen(true);
  }

  async function saveSettings() {
    try {
      const res = await fetch("/api/diary-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: DiarySettings = await res.json();
      mutateSettings(updated, { revalidate: false });
      setSettingsOpen(false);
    } catch {
      mutationError.show("Kunne ikke lagre innstillingene. Prøv igjen.");
    }
  }

  const currentStep = STEP_ORDER[stepIndex];
  const activeStep = wizardMode === "sequential" ? currentStep : fieldEditing;
  const presetsForActiveStep = activeStep && activeStep !== "notat" ? presets.filter((p) => p.category === activeStep) : [];

  function renderStepBody(step: Step) {
    if (step === "notat") {
      return (
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
      );
    }
    return (
      <>
        <p className="text-sm font-medium text-ink-1">{STEP_QUESTION[step]}</p>
        {isDayPart(step) && (
          <p className="text-2xs text-ink-4">
            {settings[step].from}–{settings[step].to}
          </p>
        )}
        <DiaryStepPicker
          presets={presetsForActiveStep}
          selected={draft[CATEGORY_FIELD[step]]}
          onToggle={(label) => toggleDraftValue(CATEGORY_FIELD[step], label)}
          onDeletePreset={(preset) => confirmDeletePreset.request(preset)}
          onRenamePreset={handleRenamePreset}
        />
      </>
    );
  }

  return (
    <div className="border-t-2 border-t-accent-privat/60 p-4">
      <CardHeader
        title="Dagbok"
        icon={Moon}
        iconColorClass="text-violet-400"
        extraAction={{ icon: Settings, onClick: openSettings, label: "Innstillinger for Dagbok" }}
      />
      <div className="flex flex-col gap-3">
        <MutationError message={mutationError.message} />

        {entriesLoading ? (
          <SkeletonRows count={2} />
        ) : wizardDate && wizardMode === "sequential" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
              {formatDMY(wizardDate)} · Steg {stepIndex + 1} av {STEP_ORDER.length}
            </p>
            {renderStepBody(currentStep)}
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
        ) : wizardDate && wizardMode === "fields" && fieldEditing ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{formatDMY(wizardDate)}</p>
            {renderStepBody(fieldEditing)}
            <div className="flex items-center gap-2">
              <button type="button" onClick={cancelFieldEdit} className="text-xs font-medium text-ink-4 hover:text-ink-2">
                Avbryt
              </button>
              <button
                type="button"
                onClick={saveFieldEdit}
                disabled={submitting}
                className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
              >
                Lagre
              </button>
            </div>
          </div>
        ) : wizardDate && wizardMode === "fields" ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Rediger {formatDMY(wizardDate)}</p>
            <ul className="flex flex-col divide-y divide-line">
              {STEP_ORDER.map((step) => (
                <li key={step}>
                  <button
                    type="button"
                    onClick={() => startEditField(step)}
                    className="flex w-full items-center justify-between gap-2 py-2 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-1">{STEP_TITLE[step]}</p>
                      <p className="truncate text-xs text-ink-4">{fieldSummary(step, draft)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={closeWizard}
              className="self-end rounded-lg border border-line px-3 py-1.5 text-2xs font-semibold uppercase text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              Lukk
            </button>
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

            <DiaryHistoryTable
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
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dagbok-innstillinger</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-4">
              Definer hva du selv regner som morgen/ettermiddag/kveld — vises som en liten påminnelse i veiviseren, endrer
              ingen logikk.
            </p>
            {(["morgen", "ettermiddag", "kveld"] as const).map((period) => (
              <div key={period} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm text-ink-1">{PERIOD_LABEL[period]}</span>
                <input
                  type="time"
                  value={settingsDraft[period].from}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, [period]: { ...s[period], from: e.target.value } }))}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <span className="text-ink-4">–</span>
                <input
                  type="time"
                  value={settingsDraft[period].to}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, [period]: { ...s[period], to: e.target.value } }))}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setSettingsOpen(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
              Avbryt
            </button>
            <button
              type="button"
              onClick={saveSettings}
              className="rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
            >
              Lagre
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
