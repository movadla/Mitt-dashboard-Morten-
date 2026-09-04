"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import {
  CardHeader,
  CheckIcon,
  CollapsibleBody,
  ConfirmDialog,
  MutationError,
  SkeletonRows,
  usePersistedCollapse,
  useConfirmDelete,
  useMutationError,
} from "../CardShell";
import type { Project, ProjectStatus } from "@/lib/projects";
import { formatDMY } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import { FolderKanban, X } from "lucide-react";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planlegging: "Planlegging",
  pagar: "Pågår",
  fullfort: "Fullført",
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "fullfort") {
    return <span className="rounded-md bg-status-positive/15 px-2 py-0.5 text-2xs font-semibold text-status-positive">Fullført</span>;
  }
  if (status === "pagar") {
    return <span className="rounded-md bg-status-action/15 px-2 py-0.5 text-2xs font-semibold text-status-action">Pågår</span>;
  }
  return <span className="rounded-md border border-line px-2 py-0.5 text-2xs font-medium text-ink-3">Planlegging</span>;
}

function ProjectProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const size = 14;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - done / total);
  const complete = done === total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-line-strong" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={complete ? "text-emerald-500" : "text-accent-privat"}
      />
    </svg>
  );
}

type SimpleItem = { id: string; label: string; done: boolean; meta?: string; note?: string };

// Inline notat-redigering for ett punkt — kun brukt av sjekklisten (der
// onSaveNote sendes inn), ikke gjesteliste/innkjøp. Notatet er også det
// assistenten skriver til via note_on_project_item (lib/chatAgent.ts), så
// dette er visningen som gjør de notatene synlige i appen.
function ItemNote({ note, onSave }: { note?: string; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  if (editing) {
    return (
      <div className="ml-7 flex flex-col gap-1.5">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Notat om dette punktet..."
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(false)} className="text-2xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
            className="ml-auto rounded-lg bg-accent-privat px-2.5 py-1 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
          >
            Lagre
          </button>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="ml-7 self-start text-2xs font-medium text-ink-4 hover:text-ink-2"
      >
        + Notat
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(note);
        setEditing(true);
      }}
      className="ml-7 self-start text-left"
    >
      <p className="whitespace-pre-line text-2xs text-ink-3">{note}</p>
    </button>
  );
}

// Delt rad-/tillegg-mønster for de tre sub-listene (sjekkliste/gjesteliste/
// innkjøp) — samme sirkel-avkrysning + X-slett-med-bekreftelse som
// ReminderSubtasks i RemindersSection.tsx, generalisert til å dekke alle tre
// siden de kun skiller seg i feltnavn, ikke i selve rad-oppførselen.
function ProjectListBlock({
  items,
  placeholder,
  withQuantity = false,
  onAdd,
  onToggle,
  onRemove,
  onSaveNote,
}: {
  items: SimpleItem[];
  placeholder: string;
  withQuantity?: boolean;
  onAdd: (label: string, meta?: string) => void;
  onToggle: (id: string) => void;
  onRemove: (item: SimpleItem) => void;
  // Kun satt for sjekklisten — gjesteliste/innkjøp har ingen notater.
  onSaveNote?: (id: string, note: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [meta, setMeta] = useState("");

  function submit() {
    if (!label.trim()) return;
    onAdd(label.trim(), withQuantity ? meta.trim() || undefined : undefined);
    setLabel("");
    setMeta("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggle(item.id)}
                  aria-pressed={item.done}
                  aria-label={item.done ? "Marker som ikke gjort" : "Marker som gjort"}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 transition ${
                    item.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-ink-3"
                  }`}
                >
                  {item.done && <CheckIcon className="h-3 w-3 text-surface-0" />}
                </button>
                <p className={`min-w-0 flex-1 truncate text-sm ${item.done ? "text-ink-4 line-through" : "text-ink-1"}`}>
                  {item.label}
                  {item.meta && <span className="ml-1.5 text-ink-4">· {item.meta}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label="Slett"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {onSaveNote && <ItemNote note={item.note} onSave={(note) => onSaveNote(item.id, note)} />}
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
              if (e.key === "Enter" && !withQuantity) submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          {withQuantity && (
            <input
              type="text"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Antall"
              className="w-20 shrink-0 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!label.trim()}
            className="shrink-0 rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
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

function ProjectSubSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [collapsed, toggle] = usePersistedCollapse(`projects-sub:${title}`, false);
  return (
    <div className="rounded-xl border border-line bg-surface-2/40">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex w-full items-center justify-between px-3 py-2 text-left">
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

function ProjectEditForm({ project, onCancel, onSave }: { project: Project; onCancel: () => void; onSave: (updates: { name: string; description?: string; targetDate?: string; status: ProjectStatus }) => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [targetDate, setTargetDate] = useState(project.targetDate ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);

  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() || undefined, targetDate: targetDate || undefined, status });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Beskrivelse (valgfritt)..."
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

export default function ProjectsSection() {
  const { data, isLoading: loading, mutate: mutateProjects } = useSWR<{ projects: Project[] }>("/api/projects", jsonFetcher);
  const projects = data?.projects ?? [];
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const confirmDeleteProject = useConfirmDelete<string>();
  const confirmDeleteItem = useConfirmDelete<{ projectId: string; kind: "checklist" | "guests" | "purchases"; itemId: string; preview: string }>();
  const mutationError = useMutationError();

  function updateLocal(updated: Project) {
    mutateProjects((current) => current && { projects: current.projects.map((p) => (p.id === updated.id ? updated : p)) }, { revalidate: false });
  }

  async function handleAdd() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, targetDate: targetDate || undefined }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke opprette prosjektet. Prøv igjen.");
        return;
      }
      const created: Project = await res.json();
      mutateProjects((current) => current && { projects: [...current.projects, created] }, { revalidate: false });
      setName("");
      setTargetDate("");
      setShowForm(false);
      setExpandedId(created.id);
    } catch {
      mutationError.show("Kunne ikke opprette prosjektet. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(id: string, updates: { name: string; description?: string; targetDate?: string; status: ProjectStatus }) {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, description: updates.description ?? null, targetDate: updates.targetDate ?? null }),
      });
      if (!res.ok) throw new Error("save failed");
      updateLocal(await res.json());
      setEditingId(null);
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  async function handleRemoveProject(id: string) {
    let previous: Project[] = [];
    mutateProjects(
      (current) => {
        previous = current?.projects ?? [];
        return current && { projects: current.projects.filter((p) => p.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      mutateProjects({ projects: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette prosjektet. Prøv igjen.");
    }
  }

  async function handleAddItem(projectId: string, kind: "checklist" | "guests" | "purchases", label: string, meta?: string) {
    try {
      const body = kind === "purchases" ? { name: label, quantity: meta } : kind === "guests" ? { name: label } : { text: label };
      const res = await fetch(`/api/projects/${projectId}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("add failed");
      updateLocal(await res.json());
    } catch {
      mutationError.show("Kunne ikke legge til punktet. Prøv igjen.");
    }
  }

  async function handleToggleItem(projectId: string, kind: "checklist" | "guests" | "purchases", itemId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/${kind}/${itemId}`, { method: "PATCH" });
      if (!res.ok) throw new Error("toggle failed");
      updateLocal(await res.json());
      vibrate(8);
    } catch {
      mutationError.show("Kunne ikke oppdatere punktet. Prøv igjen.");
    }
  }

  // Notat på ett sjekklistepunkt — samme PATCH-rute som avhukingen, men med
  // body ({ notes }), se app/api/projects/[id]/checklist/[itemId]/route.ts.
  async function handleSaveItemNote(projectId: string, itemId: string, note: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: note }),
      });
      if (!res.ok) throw new Error("note failed");
      updateLocal(await res.json());
    } catch {
      mutationError.show("Kunne ikke lagre notatet. Prøv igjen.");
    }
  }

  async function handleRemoveItem(projectId: string, kind: "checklist" | "guests" | "purchases", itemId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/${kind}/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
      updateLocal(await res.json());
    } catch {
      mutationError.show("Kunne ikke slette punktet. Prøv igjen.");
    }
  }

  return (
    <div className="border-t-2 border-t-accent-privat/60 p-4">
      <CardHeader title="Prosjekter" onAdd={() => setShowForm(true)} addLabel="Nytt prosjekt" icon={FolderKanban} iconColorClass="text-accent-privat" />
      <div className="flex flex-col gap-3">
        <MutationError message={mutationError.message} />
        {showForm && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setShowForm(false);
              }}
              placeholder="Prosjektnavn (f.eks. Dåpen til Alfred)..."
              className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
              />
              <button type="button" onClick={() => setShowForm(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!name.trim() || submitting}
                className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
              >
                Opprett
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonRows count={2} />
        ) : projects.length === 0 ? (
          <p className="text-sm text-ink-3">Ingen prosjekter ennå.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => {
              const total = project.checklist.length + project.guests.length + project.purchases.length;
              const done =
                project.checklist.filter((i) => i.done).length +
                project.guests.filter((i) => i.done).length +
                project.purchases.filter((i) => i.done).length;
              const expanded = expandedId === project.id;

              if (editingId === project.id) {
                return (
                  <li key={project.id}>
                    <ProjectEditForm project={project} onCancel={() => setEditingId(null)} onSave={(updates) => handleSaveEdit(project.id, updates)} />
                  </li>
                );
              }

              return (
                <li key={project.id} className="rounded-xl border border-line bg-surface-2 p-2.5">
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : project.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-ink-1">{project.name}</p>
                        <StatusBadge status={project.status} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-4">
                        {project.targetDate && <span>{formatDMY(project.targetDate)}</span>}
                        {total > 0 && (
                          <span className="inline-flex items-center gap-1">
                            {project.targetDate && <span>·</span>}
                            <ProjectProgress done={done} total={total} />
                            {`${done}/${total}`}
                          </span>
                        )}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(project.id)}
                      className="shrink-0 text-2xs font-medium text-ink-4 hover:text-ink-2"
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeleteProject.request(project.id)}
                      aria-label="Slett prosjekt"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <CollapsibleBody collapsed={!expanded}>
                    <div className="mt-2.5 flex flex-col gap-2">
                      {project.description && <p className="text-sm text-ink-3">{project.description}</p>}
                      <ProjectSubSection title="Sjekkliste">
                        <ProjectListBlock
                          items={project.checklist.map((i) => ({ id: i.id, label: i.text, done: i.done, note: i.notes }))}
                          placeholder="Nytt punkt..."
                          onAdd={(label) => handleAddItem(project.id, "checklist", label)}
                          onToggle={(id) => handleToggleItem(project.id, "checklist", id)}
                          onRemove={(item) => confirmDeleteItem.request({ projectId: project.id, kind: "checklist", itemId: item.id, preview: item.label })}
                          onSaveNote={(id, note) => handleSaveItemNote(project.id, id, note)}
                        />
                      </ProjectSubSection>
                      <ProjectSubSection title="Gjesteliste">
                        <ProjectListBlock
                          items={project.guests.map((g) => ({ id: g.id, label: g.name, done: g.done }))}
                          placeholder="Navn på gjest..."
                          onAdd={(label) => handleAddItem(project.id, "guests", label)}
                          onToggle={(id) => handleToggleItem(project.id, "guests", id)}
                          onRemove={(item) => confirmDeleteItem.request({ projectId: project.id, kind: "guests", itemId: item.id, preview: item.label })}
                        />
                      </ProjectSubSection>
                      <ProjectSubSection title="Innkjøp">
                        <ProjectListBlock
                          items={project.purchases.map((p) => ({ id: p.id, label: p.name, done: p.done, meta: p.quantity }))}
                          placeholder="Vare..."
                          withQuantity
                          onAdd={(label, meta) => handleAddItem(project.id, "purchases", label, meta)}
                          onToggle={(id) => handleToggleItem(project.id, "purchases", id)}
                          onRemove={(item) => confirmDeleteItem.request({ projectId: project.id, kind: "purchases", itemId: item.id, preview: item.label })}
                        />
                      </ProjectSubSection>
                    </div>
                  </CollapsibleBody>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={confirmDeleteProject.isOpen}
        message={`Slette prosjektet «${projects.find((p) => p.id === confirmDeleteProject.pending)?.name ?? ""}»? Alt innhold (sjekkliste, gjesteliste, innkjøp) forsvinner.`}
        onCancel={confirmDeleteProject.cancel}
        onConfirm={() => {
          handleRemoveProject(confirmDeleteProject.pending!);
          confirmDeleteProject.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmDeleteItem.isOpen}
        message={confirmDeleteItem.pending ? `Slette «${confirmDeleteItem.pending.preview}»?` : ""}
        onCancel={confirmDeleteItem.cancel}
        onConfirm={() => {
          const pending = confirmDeleteItem.pending;
          if (pending) handleRemoveItem(pending.projectId, pending.kind, pending.itemId);
          confirmDeleteItem.cancel();
        }}
      />
    </div>
  );
}
