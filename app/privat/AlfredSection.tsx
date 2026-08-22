"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { AlfredFreeNote, AlfredProfile, GrowthEntry, Milestone, MilestoneCategory, PlayIdea } from "@/lib/alfred";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import { Bot, X } from "lucide-react";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  motorikk: "Motorisk utvikling",
  barnehage: "Barnehageplan",
  fokus: "Fremtidige milepæler",
};

const CATEGORY_ORDER: MilestoneCategory[] = ["motorikk", "barnehage", "fokus"];

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function ageInMonths(bornIso: string, todayIso: string): number | null {
  if (!bornIso) return null;
  const born = new Date(bornIso + "T00:00:00Z");
  const today = new Date(todayIso + "T00:00:00Z");
  let months = (today.getUTCFullYear() - born.getUTCFullYear()) * 12 + (today.getUTCMonth() - born.getUTCMonth());
  if (today.getUTCDate() < born.getUTCDate()) months--;
  return Math.max(0, months);
}

function EditableNote({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  function startEditing() {
    setText(value);
    setEditing(true);
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-4">{label}</p>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setText(value);
                setEditing(false);
              }}
              className="text-xs font-medium text-ink-4 hover:text-ink-2"
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(text.trim());
                setEditing(false);
              }}
              className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
            >
              Lagre
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startEditing} className="block w-full whitespace-pre-line text-left text-sm text-ink-1">
          {value || <span className="text-ink-4">Trykk for å legge til</span>}
        </button>
      )}
    </div>
  );
}

// Drill-down-underseksjon inni Alfred-kortet — egen kollapset/åpen-tilstand
// (lagret separat per underseksjon) slik at man kan la Vekst stå åpen og
// Notater lukket, i stedet for at alt dumpes i én lang liste når kortet åpnes.
function AlfredSubSection({
  title,
  storageKey,
  defaultCollapsed = true,
  children,
}: {
  title: string;
  storageKey: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, toggle] = usePersistedCollapse(storageKey, defaultCollapsed);
  return (
    <div className="rounded-xl border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{title}</span>
        <svg
          viewBox="0 0 16 16"
          className={`h-3 w-3 shrink-0 text-ink-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>
      </CollapsibleBody>
    </div>
  );
}

// Forenklet til kun fødselsdato (jf. Morten) — name/birthPlace/parents/
// address er BEHOLDT i AlfredProfile-typen og Redis-dataen (skjules, slettes
// ikke), i tilfelle de skulle bli relevante igjen senere.
function GrunninfoBox({ profile, onSave }: { profile: AlfredProfile; onSave: (updates: Partial<AlfredProfile>) => void }) {
  const [editing, setEditing] = useState(false);
  const [born, setBorn] = useState(profile.born);

  function startEditing() {
    setBorn(profile.born);
    setEditing(true);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
        <input
          type="date"
          value={born}
          onChange={(e) => setBorn(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => {
              onSave({ born });
              setEditing(false);
            }}
            className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
          >
            Lagre
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={startEditing} className="flex flex-col gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left">
      <p className="text-sm text-ink-1">Født {profile.born ? formatDMY(profile.born) : "—"}</p>
    </button>
  );
}

function MilestoneRow({ item, onToggle, onRemove }: { item: Milestone; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-pressed={item.done}
        aria-label={item.done ? "Marker som ikke fullført" : "Marker som fullført"}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
          item.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-line-strong"
        }`}
      >
        {item.done && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-surface-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5L6.5 12 13 5" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${item.done ? "text-ink-4 line-through" : "text-ink-1"}`}>{item.label}</p>
        {item.done && item.achievedDate && <p className="mt-0.5 text-2xs text-ink-4">{formatDMY(item.achievedDate)}</p>}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label="Slett punkt"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function MilestoneGroup({
  category,
  items,
  onToggle,
  onRemove,
  onAdd,
}: {
  category: MilestoneCategory;
  items: Milestone[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (category: MilestoneCategory, label: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{CATEGORY_LABEL[category]}</p>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <MilestoneRow key={item.id} item={item} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && label.trim()) {
                onAdd(category, label.trim());
                setLabel("");
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Nytt punkt..."
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <button
            type="button"
            onClick={() => {
              if (!label.trim()) return;
              onAdd(category, label.trim());
              setLabel("");
              setAdding(false);
            }}
            disabled={!label.trim()}
            className="rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
          >
            Legg til
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80">
          + Nytt punkt
        </button>
      )}
    </div>
  );
}

function PlayList({
  ideas,
  onAdd,
  onRemove,
}: {
  ideas: PlayIdea[];
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  function submit() {
    if (!label.trim()) return;
    onAdd(label.trim());
    setLabel("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ideas.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {ideas.map((idea) => (
            <li key={idea.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
              <p className="min-w-0 flex-1 text-sm text-ink-1">{idea.label}</p>
              <button
                type="button"
                onClick={() => onRemove(idea.id)}
                aria-label="Slett punkt"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Ny idé..."
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!label.trim()}
            className="rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
          >
            Legg til
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80">
          + Nytt punkt
        </button>
      )}
    </div>
  );
}

function GrowthSection({
  entries,
  onAdd,
  onRemove,
}: {
  entries: GrowthEntry[];
  onAdd: (input: { date: string; weightKg: number; lengthCm?: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");

  const latest = entries[entries.length - 1];

  function save() {
    const weightKg = Number(weight.replace(",", "."));
    if (!date || !weight.trim() || Number.isNaN(weightKg)) return;
    onAdd({ date, weightKg, lengthCm: length ? Number(length.replace(",", ".")) : undefined });
    setDate("");
    setWeight("");
    setLength("");
    setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Vekst</p>
        {latest && (
          <p className="text-xs text-ink-3">
            Siste: {latest.weightKg.toLocaleString("nb-NO")} kg{latest.lengthCm ? ` / ${latest.lengthCm} cm` : ""} ({formatDMY(latest.date)})
          </p>
        )}
      </div>
      {entries.length > 0 && (
        <ul className="flex flex-col gap-1">
          {[...entries].reverse().map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
              <p className="min-w-0 flex-1 text-sm text-ink-1">
                {e.approxDate ? "~" : ""}
                {formatDMY(e.date)}
              </p>
              <p className="shrink-0 text-sm tabular-nums text-ink-2">
                {e.weightKg.toLocaleString("nb-NO")} kg{e.lengthCm ? ` / ${e.lengthCm} cm` : ""}
              </p>
              <button
                type="button"
                onClick={() => onRemove(e.id)}
                aria-label="Slett måling"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showForm ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
            />
            <input
              type="number"
              step="0.001"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Vekt (kg)"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
            />
            <input
              type="number"
              step="0.1"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="Lengde (cm)"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
              Avbryt
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!date || !weight.trim()}
              className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
            >
              Lagre
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          <span className="text-base leading-none">+</span> Ny måling
        </button>
      )}
    </div>
  );
}

// Egne fritekstnotater — dato+klokkeslett-stemplet, kan redigeres og
// slettes, i motsetning til de faste *Notat-feltene over (én tekst per
// navngitt kategori). Klikk-for-å-redigere-følelsen speiler EditableNote,
// men her er det en liste av flere separate notater.
function FreeNoteRow({
  note,
  onSave,
  onRemove,
}: {
  note: AlfredFreeNote;
  onSave: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);

  function startEditing() {
    setText(note.text);
    setEditing(true);
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => {
              if (!text.trim()) return;
              onSave(note.id, text.trim());
              setEditing(false);
            }}
            disabled={!text.trim()}
            className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
          >
            Lagre
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={startEditing} className="min-w-0 flex-1 text-left">
        <p className="whitespace-pre-line text-sm text-ink-1">{note.text}</p>
        <p className="mt-0.5 text-2xs text-ink-4">
          {formatDateTime(note.updatedAt ?? note.createdAt)}
          {note.updatedAt ? " (redigert)" : ""}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onRemove(note.id)}
        aria-label="Slett notat"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function FreeNoteList({
  notes,
  onAdd,
  onSave,
  onRemove,
}: {
  notes: AlfredFreeNote[];
  onAdd: (text: string) => void;
  onSave: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {notes.map((note) => (
            <FreeNoteRow key={note.id} note={note} onSave={onSave} onRemove={onRemove} />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Skriv notat..."
            className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAdding(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
              Avbryt
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
            >
              Lagre
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          <span className="text-base leading-none">+</span> Nytt notat
        </button>
      )}
    </div>
  );
}

// Skalerer/komprimerer bildet i nettleseren FØR opplasting, slik at
// Redis-feltet forblir lite (typisk noen titalls KB) — appen har ingen
// fillagring, kun base64-i-Redis for dette (jf. Morten, "ingen nye
// avhengigheter").
function resizeImageFile(file: File, maxSize = 480, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunne ikke lese filen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Kunne ikke lese bildet"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Kunne ikke tegne bildet"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Sirkulær profilbilde-ramme øverst i kortet — klikk trigger filvalg
// (usynlig <input type="file">), viser et nøytralt ikon når intet bilde
// er satt ennå.
function AlfredPhoto({ photo, onSave }: { photo?: string; onSave: (dataUri: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUri = await resizeImageFile(file);
      onSave(dataUri);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={photo ? "Endre bilde av Alfred" : "Legg til bilde av Alfred"}
        className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 transition hover:border-line-strong"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <Bot className="h-6 w-6 text-ink-4" />
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      {uploading && <p className="text-2xs text-ink-4">Laster opp...</p>}
    </div>
  );
}

export default function AlfredSection() {
  const [profile, setProfile] = useState<AlfredProfile | null>(null);
  const [growth, setGrowth] = useState<GrowthEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [playIdeas, setPlayIdeas] = useState<PlayIdea[]>([]);
  const [freeNotes, setFreeNotes] = useState<AlfredFreeNote[]>([]);
  const confirmDelete = useConfirmDelete<{ type: "growth" | "milestone" | "playIdea" | "freeNote"; id: string }>();
  const mutationError = useMutationError();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/alfred/profile").then((r) => r.json()),
      fetch("/api/alfred/growth").then((r) => r.json()),
      fetch("/api/alfred/milestones").then((r) => r.json()),
      fetch("/api/alfred/play").then((r) => r.json()),
      fetch("/api/alfred/free-notes").then((r) => r.json()),
    ])
      .then(([p, g, m, pl, fn]) => {
        setProfile(p.profile ?? null);
        setGrowth((g.entries ?? []) as GrowthEntry[]);
        setMilestones((m.milestones ?? []) as Milestone[]);
        setPlayIdeas((pl.ideas ?? []) as PlayIdea[]);
        setFreeNotes((fn.notes ?? []) as AlfredFreeNote[]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function saveProfile(updates: Partial<AlfredProfile>) {
    try {
      const res = await fetch("/api/alfred/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("save failed");
      setProfile(await res.json());
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  async function addGrowth(input: { date: string; weightKg: number; lengthCm?: number }) {
    try {
      const res = await fetch("/api/alfred/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("add failed");
      const created: GrowthEntry = await res.json();
      setGrowth((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til målingen. Prøv igjen.");
    }
  }

  async function removeGrowth(id: string) {
    let previous: GrowthEntry[] = [];
    setGrowth((prev) => {
      previous = prev;
      return prev.filter((e) => e.id !== id);
    });
    try {
      const res = await fetch(`/api/alfred/growth/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      setGrowth(previous);
      mutationError.show("Kunne ikke slette målingen. Prøv igjen.");
    }
  }

  async function addFreeNote(text: string) {
    try {
      const res = await fetch("/api/alfred/free-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("add failed");
      const created: AlfredFreeNote = await res.json();
      setFreeNotes((prev) => [created, ...prev]);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til notatet. Prøv igjen.");
    }
  }

  async function saveFreeNote(id: string, text: string) {
    try {
      const res = await fetch(`/api/alfred/free-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: AlfredFreeNote = await res.json();
      setFreeNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke lagre notatet. Prøv igjen.");
    }
  }

  async function removeFreeNote(id: string) {
    let previous: AlfredFreeNote[] = [];
    setFreeNotes((prev) => {
      previous = prev;
      return prev.filter((n) => n.id !== id);
    });
    try {
      const res = await fetch(`/api/alfred/free-notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      setFreeNotes(previous);
      mutationError.show("Kunne ikke slette notatet. Prøv igjen.");
    }
  }

  async function toggleMilestoneItem(id: string) {
    try {
      const res = await fetch(`/api/alfred/milestones/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("toggle failed");
      const updated: Milestone = await res.json();
      setMilestones((prev) => prev.map((m) => (m.id === id ? updated : m)));
      vibrate(updated.done ? 15 : 8);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke oppdatere milepælen. Prøv igjen.");
    }
  }

  async function removeMilestone(id: string) {
    let previous: Milestone[] = [];
    setMilestones((prev) => {
      previous = prev;
      return prev.filter((m) => m.id !== id);
    });
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/alfred/milestones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      setMilestones(previous);
      mutationError.show("Kunne ikke slette milepælen. Prøv igjen.");
    }
  }

  async function addMilestoneItem(category: MilestoneCategory, label: string) {
    try {
      const res = await fetch("/api/alfred/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, label }),
      });
      if (!res.ok) throw new Error("add failed");
      const created: Milestone = await res.json();
      setMilestones((prev) => [...prev, created]);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til milepælen. Prøv igjen.");
    }
  }

  async function addPlayIdeaItem(label: string) {
    try {
      const res = await fetch("/api/alfred/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("add failed");
      const created: PlayIdea = await res.json();
      setPlayIdeas((prev) => [...prev, created]);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til ideen. Prøv igjen.");
    }
  }

  async function removePlayIdea(id: string) {
    let previous: PlayIdea[] = [];
    setPlayIdeas((prev) => {
      previous = prev;
      return prev.filter((p) => p.id !== id);
    });
    try {
      const res = await fetch(`/api/alfred/play/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      setPlayIdeas(previous);
      mutationError.show("Kunne ikke slette ideen. Prøv igjen.");
    }
  }

  const today = localDateString();
  const months = profile ? ageInMonths(profile.born, today) : null;
  const latestGrowth = growth[growth.length - 1];
  const subtitle =
    latestGrowth || months !== null
      ? [months !== null ? `${months} mnd` : null, latestGrowth ? `${latestGrowth.weightKg.toLocaleString("nb-NO")} kg` : null]
          .filter(Boolean)
          .join(" · ")
      : "Ukentlig";

  return (
    <div className="border-t-2 border-t-status-action/60 p-4">
      <CardHeader
        title="Alfred"
        subtitle={subtitle}
        icon={Bot}
        iconColorClass="text-status-action"
      />
        <div className="flex flex-col gap-3">
          <MutationError message={mutationError.message} />
          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              {profile && <AlfredPhoto photo={profile.photo} onSave={(dataUri) => saveProfile({ photo: dataUri })} />}

              {profile && (
                <AlfredSubSection title="Grunninfo" storageKey="Alfred - Grunninfo">
                  <GrunninfoBox profile={profile} onSave={saveProfile} />
                </AlfredSubSection>
              )}

              <AlfredSubSection title="Vekst" storageKey="Alfred - Vekst">
                <GrowthSection entries={growth} onAdd={addGrowth} onRemove={(id) => confirmDelete.request({ type: "growth", id })} />
              </AlfredSubSection>

              <AlfredSubSection title="Milepæler" storageKey="Alfred - Milepæler">
                {CATEGORY_ORDER.map((category) => (
                  <MilestoneGroup
                    key={category}
                    category={category}
                    items={milestones.filter((m) => m.category === category)}
                    onToggle={toggleMilestoneItem}
                    onRemove={(id) => confirmDelete.request({ type: "milestone", id })}
                    onAdd={addMilestoneItem}
                  />
                ))}
              </AlfredSubSection>

              <AlfredSubSection title="Lek" storageKey="Alfred - Lek">
                <PlayList ideas={playIdeas} onAdd={addPlayIdeaItem} onRemove={(id) => confirmDelete.request({ type: "playIdea", id })} />
              </AlfredSubSection>

              {profile && (
                <AlfredSubSection title="Notater" storageKey="Alfred - Notater">
                  <EditableNote label="Motorisk (notat)" value={profile.motorikkNotat} onSave={(v) => saveProfile({ motorikkNotat: v })} />
                  <EditableNote label="Helse" value={profile.helseNotat} onSave={(v) => saveProfile({ helseNotat: v })} />
                  <EditableNote label="Mat og søvn" value={profile.matOgSovnNotat} onSave={(v) => saveProfile({ matOgSovnNotat: v })} />
                  <EditableNote label="Permisjon" value={profile.permisjonNotat} onSave={(v) => saveProfile({ permisjonNotat: v })} />
                  <EditableNote label="Barnehage" value={profile.barnehageNotat} onSave={(v) => saveProfile({ barnehageNotat: v })} />
                  <EditableNote label="Barnesikring" value={profile.barnesikringNotat} onSave={(v) => saveProfile({ barnesikringNotat: v })} />
                  <FreeNoteList
                    notes={freeNotes}
                    onAdd={addFreeNote}
                    onSave={saveFreeNote}
                    onRemove={(id) => confirmDelete.request({ type: "freeNote", id })}
                  />
                </AlfredSubSection>
              )}
            </>
          )}
        </div>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={(() => {
          const pending = confirmDelete.pending;
          if (!pending) return "";
          if (pending.type === "growth") {
            const entry = growth.find((g) => g.id === pending.id);
            return `Slette vekstmålingen fra ${entry ? formatDMY(entry.date) : "denne datoen"}?`;
          }
          if (pending.type === "milestone") return `Slette milepælen «${milestones.find((m) => m.id === pending.id)?.label ?? ""}»?`;
          if (pending.type === "freeNote") return "Slette dette notatet?";
          return `Slette lekidéen «${playIdeas.find((p) => p.id === pending.id)?.label ?? ""}»?`;
        })()}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          if (pending.type === "growth") removeGrowth(pending.id);
          else if (pending.type === "milestone") removeMilestone(pending.id);
          else if (pending.type === "freeNote") removeFreeNote(pending.id);
          else removePlayIdea(pending.id);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
