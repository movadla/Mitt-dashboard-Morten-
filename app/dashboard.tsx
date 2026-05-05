"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AMESTO_RECIPIENT,
  PRIORITY_META,
  SF_CATEGORY_META,
  SOURCE_META,
  TOPIC_META,
  TOPIC_ORDER,
  type AmestoEmail,
  type CaseDetails,
  type CaseTopic,
  type Priority,
  type SalesforceCategory,
  type Source,
  type Task,
} from "@/lib/tasks";

type Filter = Source | "all";
type SfTab = SalesforceCategory | "all";

const FILTERS: Filter[] = ["all", "salesforce", "asana", "outlook", "teams"];
const SF_TABS: SfTab[] = ["mine", "new", "pending", "all"];

const DONE_STORAGE_KEY = "mitt-dashboard:done:v1";

const SF_TAB_LABEL: Record<SfTab, string> = {
  mine: "Mine",
  new: "Nye",
  pending: "Avventende",
  all: "Samlet",
};

function formatDue(iso: string | undefined, today: string): string | null {
  if (!iso) return null;
  if (iso === today) return "I dag";
  const d = new Date(iso);
  const t = new Date(today);
  const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return "I morgen";
  if (diff === -1) return "I går";
  if (diff < 0) return `${Math.abs(diff)} dager forsinket`;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function buildAmestoMailto(email: AmestoEmail): string {
  const params = new URLSearchParams({
    subject: email.subject,
    body: email.body,
  });
  // mailto wants %20 for spaces (URLSearchParams uses '+'); fix it.
  return `mailto:${AMESTO_RECIPIENT}?${params.toString().replace(/\+/g, "%20")}`;
}

function buildClaudeShareText(task: Task): string {
  const lines: string[] = [];
  lines.push(task.title);
  lines.push("");

  const statusBits: string[] = [];
  if (task.context) statusBits.push(task.context);
  if (task.priority) statusBits.push(`Prioritet: ${PRIORITY_META[task.priority].label}`);
  if (task.topic) statusBits.push(`Kategori: ${TOPIC_META[task.topic].label}`);
  if (statusBits.length) lines.push(statusBits.join(" · "));

  if (task.details) {
    lines.push("");
    const d = task.details;
    if (d.kunde) lines.push(`Kunde: ${d.kunde}`);
    if (d.kontoType) lines.push(`Konto-type: ${d.kontoType}`);
    if (d.kontaktperson) lines.push(`Kontaktperson: ${d.kontaktperson}`);
    if (d.bygg) {
      lines.push(`Bygg: ${d.bygg}${d.byggInherited ? " (fra kunde)" : ""}`);
    }
    if (d.kontoeier) lines.push(`Kontoeier (KAM): ${d.kontoeier}`);
    if (d.hovedkontrakt) lines.push(`Hovedkontrakt: ${d.hovedkontrakt}`);
    if (d.note) {
      lines.push("");
      lines.push(`Merk: ${d.note}`);
    }
  }

  if (task.summary) {
    lines.push("");
    lines.push("Sammendrag:");
    lines.push(task.summary);
  }

  lines.push("");
  lines.push(`SF: ${task.externalUrl}`);

  return lines.join("\n");
}

function PriorityDot({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
      title={`Prioritet: ${meta.label}`}
      aria-label={`Prioritet ${meta.label}`}
    />
  );
}

function DetailsPanel({ details }: { details: CaseDetails }) {
  type Row = { label: string; value?: string; flag?: "inherited" };
  const rows: Row[] = [
    { label: "Kunde", value: details.kunde },
    { label: "Konto-type", value: details.kontoType },
    { label: "Kontaktperson", value: details.kontaktperson },
    {
      label: "Bygg",
      value: details.bygg,
      flag: details.byggInherited ? "inherited" : undefined,
    },
    { label: "Kontoeier (KAM)", value: details.kontoeier },
    { label: "Hovedkontrakt", value: details.hovedkontrakt },
  ];
  const visibleRows = rows.filter((r) => r.value);

  return (
    <div className="mt-3 rounded-xl bg-zinc-900/40 p-3 ring-1 ring-zinc-800">
      {visibleRows.length === 0 && (
        <p className="text-xs text-zinc-500">
          Ingen tilleggsinfo tilgjengelig.
        </p>
      )}
      <dl className="grid gap-2.5">
        {visibleRows.map((row) => {
          const inherited = row.flag === "inherited";
          return (
            <div key={row.label} className="flex flex-col">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {row.label}
              </dt>
              <dd
                className={`whitespace-pre-line text-sm ${
                  inherited ? "italic text-zinc-400" : "text-zinc-200"
                }`}
              >
                {row.value}
                {inherited && (
                  <span className="ml-2 inline-block rounded bg-zinc-800 px-1.5 py-0.5 align-middle text-[10px] font-medium not-italic text-zinc-400 ring-1 ring-zinc-700">
                    fra kunde
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {details.note && (
        <p className="mt-3 rounded-lg bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-200 ring-1 ring-amber-500/20">
          <span className="font-semibold">Merk:</span> {details.note}
        </p>
      )}
    </div>
  );
}

function TaskCard({
  task,
  isDone,
  isExpanded,
  detailsOpen,
  filter,
  onToggleDone,
  onToggleExpanded,
  onToggleDetails,
  today,
}: {
  task: Task;
  isDone: boolean;
  isExpanded: boolean;
  detailsOpen: boolean;
  filter: Filter;
  onToggleDone: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onToggleDetails: () => void;
  today: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShareClaude() {
    const text = buildClaudeShareText(task);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard access blocked – ignore for now */
    }
  }

  const meta = SOURCE_META[task.source];
  const due = formatDue(task.dueAt, today);
  const overdue = task.dueAt !== undefined && task.dueAt < today && !isDone;
  const isExpandable = task.source === "salesforce";
  const topic = task.topic ? TOPIC_META[task.topic] : null;

  const body = (
    <>
      <div className="flex items-center gap-2">
        {task.priority && <PriorityDot priority={task.priority} />}
        <p
          className={`text-[15px] font-medium leading-snug text-zinc-100 ${
            isDone ? "line-through" : ""
          }`}
        >
          {task.title}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        {filter === "all" && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${meta.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        )}
        {topic && (
          <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300 ring-1 ring-zinc-700">
            {topic.label}
          </span>
        )}
        {task.context && <span className="truncate">{task.context}</span>}
        {due && (
          <span
            className={`tabular-nums ${
              overdue ? "text-rose-400" : "text-zinc-400"
            }`}
          >
            · {due}
          </span>
        )}
      </div>
    </>
  );

  return (
    <li
      className={`group rounded-2xl border bg-zinc-900/60 p-3 transition ${
        isExpanded
          ? "border-sky-500/40 bg-zinc-900/80"
          : "border-zinc-800/80"
      } ${isDone ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleDone(task.id)}
          aria-label={isDone ? "Marker som ikke ferdig" : "Marker som ferdig"}
          aria-pressed={isDone}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
            isDone
              ? "bg-emerald-500 ring-emerald-500"
              : "bg-transparent ring-zinc-700 hover:ring-zinc-500"
          }`}
        >
          {isDone && (
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-zinc-950"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5L6.5 12 13 5" />
            </svg>
          )}
        </button>

        {isExpandable ? (
          <button
            type="button"
            onClick={() => onToggleExpanded(task.id)}
            aria-expanded={isExpanded}
            className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-xl p-1 text-left active:bg-zinc-800/60"
          >
            <div className="min-w-0 flex-1">{body}</div>
            <svg
              viewBox="0 0 16 16"
              className={`mt-1 h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        ) : (
          <a
            href={task.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-m-1 min-w-0 flex-1 rounded-xl p-1 active:bg-zinc-800/60"
          >
            {body}
          </a>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 ml-9 border-l-2 border-sky-500/30 pl-3">
          <p className="text-sm leading-relaxed text-zinc-300">
            {task.summary ?? "Ingen beskrivelse tilgjengelig."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 ring-1 ring-sky-500/30 transition hover:bg-sky-500/25"
            >
              Åpne i Salesforce
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3h7v7M13 3l-9 9" />
              </svg>
            </a>
            {task.details && (
              <button
                type="button"
                onClick={onToggleDetails}
                aria-expanded={detailsOpen}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-zinc-700 transition hover:bg-zinc-700"
              >
                Detaljer
                <svg
                  viewBox="0 0 16 16"
                  className={`h-3 w-3 transition-transform ${
                    detailsOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={handleShareClaude}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
                copied
                  ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                  : "bg-violet-500/15 text-violet-200 ring-violet-500/30 hover:bg-violet-500/25"
              }`}
              aria-live="polite"
            >
              {copied ? "Kopiert – lim inn i Claude" : "Del med Claude"}
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {copied ? (
                  <path d="M3 8.5L6.5 12 13 5" />
                ) : (
                  <>
                    <rect x="5" y="5" width="9" height="9" rx="1.5" />
                    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
                  </>
                )}
              </svg>
            </button>
            {task.amestoEmail && (
              <a
                href={buildAmestoMailto(task.amestoEmail)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25"
              >
                Send til Amesto
                <svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 4l6 5 6-5M2 4v8h12V4" />
                </svg>
              </a>
            )}
          </div>
          {detailsOpen && task.details && (
            <DetailsPanel details={task.details} />
          )}
        </div>
      )}
    </li>
  );
}

export default function Dashboard({
  tasks,
  today,
}: {
  tasks: Task[];
  today: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sfTab, setSfTab] = useState<SfTab>("mine");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DONE_STORAGE_KEY);
      if (stored) {
        const ids: unknown = JSON.parse(stored);
        if (Array.isArray(ids)) {
          setDone(new Set(ids.filter((x): x is string => typeof x === "string")));
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify([...done]));
    } catch {
      /* ignore quota errors */
    }
  }, [done, hydrated]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0,
      salesforce: 0,
      asana: 0,
      outlook: 0,
      teams: 0,
    };
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      c.all += 1;
      c[t.source] += 1;
    }
    return c;
  }, [tasks, done]);

  const sfTabCounts = useMemo(() => {
    const c: Record<SfTab, number> = { mine: 0, new: 0, pending: 0, all: 0 };
    for (const t of tasks) {
      if (t.source !== "salesforce" || done.has(t.id)) continue;
      c.all += 1;
      if (t.category) c[t.category] += 1;
    }
    return c;
  }, [tasks, done]);

  const visibleSf = useMemo(() => {
    const sf = tasks.filter((t) => t.source === "salesforce");
    if (sfTab === "all") return sf;
    return sf.filter((t) => t.category === sfTab);
  }, [tasks, sfTab]);

  const groupedSamlet = useMemo(() => {
    if (sfTab !== "all" || filter !== "salesforce") return null;
    const groups: Array<{
      topic: CaseTopic;
      label: string;
      items: Task[];
    }> = [];
    for (const topic of TOPIC_ORDER) {
      const items = visibleSf
        .filter((t) => t.topic === topic)
        .slice()
        .sort(
          (a, b) =>
            (a.priority ? PRIORITY_META[a.priority].rank : 9) -
            (b.priority ? PRIORITY_META[b.priority].rank : 9),
        );
      if (items.length === 0) continue;
      groups.push({ topic, label: TOPIC_META[topic].label, items });
    }
    return groups;
  }, [visibleSf, sfTab, filter]);

  const visible = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "salesforce") return visibleSf;
    return tasks.filter((t) => t.source === filter);
  }, [tasks, filter, visibleSf]);

  function toggleDone(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setDetailsOpen(false);
  }

  function toggleDetails() {
    setDetailsOpen((prev) => !prev);
  }

  const showSfTabs = filter === "salesforce";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:pt-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          Mitt dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {counts.all} {counts.all === 1 ? "oppgave" : "oppgaver"} igjen
        </p>
      </header>

      <div
        className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Kilder"
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          const label = f === "all" ? "Alle" : SOURCE_META[f].label;
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                active
                  ? "bg-zinc-100 text-zinc-900 ring-zinc-100"
                  : "bg-zinc-900 text-zinc-300 ring-zinc-800 hover:bg-zinc-800"
              }`}
            >
              {f !== "all" && (
                <span className={`h-1.5 w-1.5 rounded-full ${SOURCE_META[f].dot}`} />
              )}
              <span>{label}</span>
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? "bg-zinc-900/10 text-zinc-700" : "text-zinc-500"
                }`}
              >
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {showSfTabs && (
        <div
          className="mb-5 flex gap-1 rounded-xl bg-zinc-900/60 p-1 ring-1 ring-zinc-800"
          role="tablist"
          aria-label="Salesforce-kategori"
        >
          {SF_TABS.map((tab) => {
            const active = sfTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setSfTab(tab)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>{SF_TAB_LABEL[tab]}</span>
                <span
                  className={`tabular-nums ${
                    active ? "text-sky-300/80" : "text-zinc-500"
                  }`}
                >
                  {sfTabCounts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {groupedSamlet ? (
        <div className="flex flex-col gap-5">
          {groupedSamlet.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
              Ingen saker.
            </div>
          )}
          {groupedSamlet.map((group) => (
            <section key={group.topic}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {group.label}
                </h2>
                <span className="text-xs tabular-nums text-zinc-500">
                  {group.items.length}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {group.items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDone={done.has(task.id)}
                    isExpanded={expandedId === task.id}
                    detailsOpen={detailsOpen && expandedId === task.id}
                    filter={filter}
                    onToggleDone={toggleDone}
                    onToggleExpanded={toggleExpanded}
                    onToggleDetails={toggleDetails}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.length === 0 && (
            <li className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
              Ingen oppgaver her. Nyt stillheten.
            </li>
          )}
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isDone={done.has(task.id)}
              isExpanded={expandedId === task.id}
              detailsOpen={detailsOpen && expandedId === task.id}
              filter={filter}
              onToggleDone={toggleDone}
              onToggleExpanded={toggleExpanded}
              onToggleDetails={toggleDetails}
              today={today}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
