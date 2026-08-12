"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import type { AlfredProfile, GrowthEntry, Milestone, MilestoneCategory } from "@/lib/alfred";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import { Bot } from "lucide-react";

const CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  motorikk: "Motorisk utvikling",
  barnehage: "Barnehageplan",
  fokus: "Kommende fokus",
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
  children,
}: {
  title: string;
  storageKey: string;
  children: React.ReactNode;
}) {
  const [collapsed, toggle] = usePersistedCollapse(storageKey, true);
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
      {!collapsed && <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>}
    </div>
  );
}

function GrunninfoBox({ profile, onSave }: { profile: AlfredProfile; onSave: (updates: Partial<AlfredProfile>) => void }) {
  const [editing, setEditing] = useState(false);
  const [born, setBorn] = useState(profile.born);
  const [birthPlace, setBirthPlace] = useState(profile.birthPlace);
  const [parents, setParents] = useState(profile.parents);
  const [address, setAddress] = useState(profile.address);

  function startEditing() {
    setBorn(profile.born);
    setBirthPlace(profile.birthPlace);
    setParents(profile.parents);
    setAddress(profile.address);
    setEditing(true);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={born}
            onChange={(e) => setBorn(e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
          <input
            type="text"
            value={birthPlace}
            onChange={(e) => setBirthPlace(e.target.value)}
            placeholder="Fødested"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
          />
        </div>
        <input
          type="text"
          value={parents}
          onChange={(e) => setParents(e.target.value)}
          placeholder="Foreldre"
          className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Adresse"
          className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => {
              onSave({ born, birthPlace, parents, address });
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
    <button
      type="button"
      onClick={startEditing}
      className="flex flex-col gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left"
    >
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Grunninfo</p>
      <p className="text-sm text-ink-1">
        Født {profile.born ? formatDMY(profile.born) : "—"}
        {profile.birthPlace ? `, ${profile.birthPlace}` : ""}
      </p>
      <p className="text-sm text-ink-2">{profile.parents}</p>
      <p className="text-sm text-ink-2">{profile.address}</p>
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
      <p className={`min-w-0 flex-1 text-sm ${item.done ? "text-ink-4 line-through" : "text-ink-1"}`}>{item.label}</p>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label="Slett punkt"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
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

function WeightChart({ entries }: { entries: GrowthEntry[] }) {
  if (entries.length < 2) return null;

  const width = 280;
  const height = 84;
  const padX = 4;
  const padTop = 10;
  const padBottom = 18;

  const dates = entries.map((e) => new Date(e.date + "T00:00:00Z").getTime());
  const weights = entries.map((e) => e.weightKg);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const spanDate = maxDate - minDate || 1;
  const spanW = maxW - minW || 1;

  const x = (i: number) => padX + ((dates[i] - minDate) / spanDate) * (width - padX * 2);
  const y = (i: number) => height - padBottom - ((weights[i] - minW) / spanW) * (height - padTop - padBottom);

  const points = entries.map((_, i) => `${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(" ");

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-accent-privat" role="img" aria-label="Vekt over tid">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {entries.map((e, i) => (
          <circle key={e.id} cx={x(i)} cy={y(i)} r="2.5" fill="currentColor" />
        ))}
        <text x={padX} y={height - 4} className="fill-ink-4" fontSize="8">
          {formatDMY(entries[0].date)}
        </text>
        <text x={width - padX} y={height - 4} textAnchor="end" className="fill-ink-4" fontSize="8">
          {formatDMY(entries[entries.length - 1].date)}
        </text>
      </svg>
      <div className="mt-0.5 flex justify-between text-2xs text-ink-4">
        <span>Lavest: {minW.toLocaleString("nb-NO")} kg</span>
        <span>Høyest: {maxW.toLocaleString("nb-NO")} kg</span>
      </div>
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
      <WeightChart entries={entries} />
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
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
              >
                ×
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

export default function AlfredSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Alfred", true);
  const [profile, setProfile] = useState<AlfredProfile | null>(null);
  const [growth, setGrowth] = useState<GrowthEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const confirmDelete = useConfirmDelete<{ type: "growth" | "milestone"; id: string }>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/alfred/profile").then((r) => r.json()),
      fetch("/api/alfred/growth").then((r) => r.json()),
      fetch("/api/alfred/milestones").then((r) => r.json()),
    ])
      .then(([p, g, m]) => {
        setProfile(p.profile ?? null);
        setGrowth((g.entries ?? []) as GrowthEntry[]);
        setMilestones((m.milestones ?? []) as Milestone[]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function saveProfile(updates: Partial<AlfredProfile>) {
    const res = await fetch("/api/alfred/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setProfile(await res.json());
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function addGrowth(input: { date: string; weightKg: number; lengthCm?: number }) {
    const res = await fetch("/api/alfred/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const created: GrowthEntry = await res.json();
      setGrowth((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function removeGrowth(id: string) {
    setGrowth((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/alfred/growth/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function toggleMilestoneItem(id: string) {
    const res = await fetch(`/api/alfred/milestones/${id}`, { method: "PATCH" });
    if (res.ok) {
      const updated: Milestone = await res.json();
      setMilestones((prev) => prev.map((m) => (m.id === id ? updated : m)));
      vibrate(updated.done ? 15 : 8);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function removeMilestone(id: string) {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/alfred/milestones/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function addMilestoneItem(category: MilestoneCategory, label: string) {
    const res = await fetch("/api/alfred/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, label }),
    });
    if (res.ok) {
      const created: Milestone = await res.json();
      setMilestones((prev) => [...prev, created]);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
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
    <div className={`${CARD_SHELL} !border-2 !border-status-action p-4`}>
      <CardHeader
        title="Alfred"
        subtitle={subtitle}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Bot}
        iconColorClass="text-status-action"
      />
      {!collapsed && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              {profile && <GrunninfoBox profile={profile} onSave={saveProfile} />}

              <AlfredSubSection title="Vekst" storageKey="Alfred - Vekst">
                <GrowthSection entries={growth} onAdd={addGrowth} onRemove={(id) => confirmDelete.request({ type: "growth", id })} />
                {profile?.vekstNotat && <EditableNote label="Vekstkurve" value={profile.vekstNotat} onSave={(v) => saveProfile({ vekstNotat: v })} />}
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

              {profile && (
                <AlfredSubSection title="Notater" storageKey="Alfred - Notater">
                  <EditableNote label="Motorisk (notat)" value={profile.motorikkNotat} onSave={(v) => saveProfile({ motorikkNotat: v })} />
                  <EditableNote label="Helse" value={profile.helseNotat} onSave={(v) => saveProfile({ helseNotat: v })} />
                  <EditableNote label="Mat og søvn" value={profile.matOgSovnNotat} onSave={(v) => saveProfile({ matOgSovnNotat: v })} />
                  <EditableNote label="Permisjon" value={profile.permisjonNotat} onSave={(v) => saveProfile({ permisjonNotat: v })} />
                  <EditableNote label="Barnehage" value={profile.barnehageNotat} onSave={(v) => saveProfile({ barnehageNotat: v })} />
                  <EditableNote label="Barnesikring" value={profile.barnesikringNotat} onSave={(v) => saveProfile({ barnesikringNotat: v })} />
                </AlfredSubSection>
              )}
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={(() => {
          const pending = confirmDelete.pending;
          if (!pending) return "";
          if (pending.type === "growth") {
            const entry = growth.find((g) => g.id === pending.id);
            return `Slette vekstmålingen fra ${entry ? formatDMY(entry.date) : "denne datoen"}?`;
          }
          return `Slette milepælen «${milestones.find((m) => m.id === pending.id)?.label ?? ""}»?`;
        })()}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          if (pending.type === "growth") removeGrowth(pending.id);
          else removeMilestone(pending.id);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
