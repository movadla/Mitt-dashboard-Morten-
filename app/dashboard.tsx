"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AMESTO_RECIPIENT,
  PRIORITY_META,
  SF_CATEGORY_META,
  SOURCE_META,
  TOPIC_META,
  type AmestoEmail,
  type CaseDetails,
  type Priority,
  type Source,
  type Task,
} from "@/lib/tasks";

type Filter = Source | "all";
type SfBucket = "faktura" | "kreditnota" | "garanti" | "annet";

const FILTERS: Filter[] = ["all", "salesforce", "asana", "outlook", "teams"];
const SF_BUCKETS: SfBucket[] = ["faktura", "kreditnota", "garanti", "annet"];

const DONE_STORAGE_KEY = "mitt-dashboard:done:v1";
const PRIORITY_OVERRIDES_KEY = "mitt-dashboard:priority-overrides:v1";
const SNOOZED_KEY = "mitt-dashboard:snoozed:v1";
const LONG_PRESS_MS = 600;

const SOURCE_TAB: Partial<Record<Filter, { inactive: string; active: string; badge: string }>> = {
  salesforce: {
    inactive: "rounded-full border border-sky-600/60 bg-sky-900/70 text-sky-200 hover:bg-sky-800/70",
    active:   "rounded-t-xl rounded-b-none border border-b-0 border-sky-400/50 bg-sky-500/20 text-sky-50",
    badge: "text-sky-300/80",
  },
  asana: {
    inactive: "rounded-full border border-red-700/60 bg-red-900/70 text-red-200 hover:bg-red-800/70",
    active:   "rounded-t-xl rounded-b-none border border-b-0 border-red-400/50 bg-red-500/25 text-red-50",
    badge: "text-red-300/80",
  },
  outlook: {
    inactive: "rounded-full border border-amber-600/60 bg-amber-900/70 text-amber-200 hover:bg-amber-800/70",
    active:   "rounded-t-xl rounded-b-none border border-b-0 border-amber-400/50 bg-amber-500/20 text-amber-50",
    badge: "text-amber-300/80",
  },
  teams: {
    inactive: "rounded-full border border-violet-600/60 bg-violet-900/70 text-violet-200 hover:bg-violet-800/70",
    active:   "rounded-t-xl rounded-b-none border border-b-0 border-violet-400/50 bg-violet-500/20 text-violet-50",
    badge: "text-violet-300/80",
  },
};

const FULL_SHELL: Record<Filter, string> = {
  all:        "rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3",
  salesforce: "rounded-2xl border border-t-0 border-sky-400/50 bg-sky-500/20 p-3",
  asana:      "rounded-2xl border border-t-0 border-red-400/50 bg-red-500/25 p-3",
  outlook:    "rounded-2xl border border-t-0 border-amber-400/50 bg-amber-500/20 p-3",
  teams:      "rounded-2xl border border-t-0 border-violet-400/50 bg-violet-500/20 p-3",
};

type SourceAccent = {
  border: string;
  bg: string;
  expandedBorder: string;
  expandedShadow: string;
  innerLine: string;
  analysisBg: string;
  accentText: string;
};

const SOURCE_CARD: Record<Source, SourceAccent> = {
  salesforce: {
    border: "border-sky-700/50",
    bg: "bg-sky-500/5",
    expandedBorder: "border-sky-500/40",
    expandedShadow: "shadow-sky-500/5",
    innerLine: "border-sky-500/30",
    analysisBg: "bg-sky-500/5",
    accentText: "text-sky-400",
  },
  asana: {
    border: "border-red-700/50",
    bg: "bg-red-600/10",
    expandedBorder: "border-red-500/40",
    expandedShadow: "shadow-red-500/5",
    innerLine: "border-red-500/30",
    analysisBg: "bg-red-500/5",
    accentText: "text-red-400",
  },
  outlook: {
    border: "border-amber-700/40",
    bg: "bg-amber-500/5",
    expandedBorder: "border-amber-500/40",
    expandedShadow: "shadow-amber-500/5",
    innerLine: "border-amber-500/30",
    analysisBg: "bg-amber-500/5",
    accentText: "text-amber-400",
  },
  teams: {
    border: "border-violet-700/50",
    bg: "bg-violet-500/5",
    expandedBorder: "border-violet-500/40",
    expandedShadow: "shadow-violet-500/5",
    innerLine: "border-violet-500/30",
    analysisBg: "bg-violet-500/5",
    accentText: "text-violet-400",
  },
};

const SF_BUCKET_LABEL: Record<SfBucket, string> = {
  faktura: "Faktura",
  kreditnota: "Kreditnota",
  garanti: "Garanti",
  annet: "Annet",
};

function bucketFor(task: Task): SfBucket | null {
  if (task.source !== "salesforce") return null;
  if (task.topic === "guarantee-deposit") return "garanti";
  if (task.topic === "credit-note") return "kreditnota";
  if (
    task.topic === "missing-invoice" ||
    task.topic === "double-billed" ||
    task.topic === "missing-po"
  )
    return "faktura";
  return "annet";
}

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

function buildMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function isAddressLike(value: string): boolean {
  // Adressetekst → kan åpnes i maps. Skip parenteser ("(ikke tilknyttet bygg)" osv.)
  return !value.startsWith("(") && /\d/.test(value);
}

type CaseInfo = {
  caseNumber?: string;
  status?: string;
  customer?: string;
};

const KNOWN_STATUSES = new Set([
  "Ny",
  "Avventer kunde",
  "Avventer Kunde",
  "Iverksettes",
  "Lukket",
  "Finans",
]);

function getCaseInfo(task: Task): CaseInfo {
  let caseNumber = task.caseNumber;
  let status: string | undefined;
  let customer: string | undefined;

  if (task.context) {
    const parts = task.context.split(" · ").map((s) => s.trim());
    let i = 0;
    if (parts[i] && /^\d{6,8}$/.test(parts[i])) {
      if (!caseNumber) caseNumber = parts[i];
      i += 1;
    }
    if (parts[i] && KNOWN_STATUSES.has(parts[i])) {
      status = parts[i];
      i += 1;
    }
    customer = parts[i];
  }

  return { caseNumber, status, customer };
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

function lastModifiedTime(task: Task): number {
  return task.lastModifiedAt ? Date.parse(task.lastModifiedAt) : 0;
}

function priorityRank(priority: Priority | undefined): number {
  return priority ? PRIORITY_META[priority].rank : 9;
}

function actionOwnerRank(task: Task): number {
  const status = getCaseInfo(task).status;
  if (status === "Ny" || status === "Iverksettes") return 0; // min tur
  if (status === "Avventer kunde" || status === "Avventer Kunde") return 1; // venter
  return 2;
}

function statusColorClass(status: string | undefined): string {
  if (status === "Ny") return "text-sky-300";
  if (status === "Iverksettes") return "text-amber-300";
  if (status === "Avventer kunde" || status === "Avventer Kunde")
    return "text-zinc-500";
  return "text-zinc-400";
}

function statusDisplayLabel(status: string | undefined): string | undefined {
  if (status === "Iverksettes") return "Venter";
  return status;
}


function staleLabel(
  lastModifiedAt: string | undefined,
  priority: Priority | undefined,
  nowMs: number,
): string | null {
  if (priority !== "high" || !lastModifiedAt) return null;
  const diffMs = nowMs - Date.parse(lastModifiedAt);
  if (diffMs <= STALE_THRESHOLD_MS) return null;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 48) return `${hours}t uten oppdatering`;
  const days = Math.floor(hours / 24);
  return `${days} d uten oppdatering`;
}

function timeSinceUpdate(task: Task, nowMs: number): string | null {
  if (!task.lastModifiedAt) return null;
  const diffMs = nowMs - lastModifiedTime(task);
  const hours = diffMs / (60 * 60 * 1000);
  if (hours < 1) return "<1t";
  if (hours < 6) return "1+t";
  if (hours < 12) return "6+t";
  if (hours < 24) return "12+t";
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}+d`;
  const weeks = days / 7;
  if (weeks < 4) return `${Math.floor(weeks)}+u`;
  const months = days / 30;
  return `${Math.floor(months)}+m`;
}

function buildAskClaudeUrl(task: Task): string {
  const context = buildClaudeShareText(task);
  const prompt = `${context}\n\nKan du foreslå konkrete oppfølgingspunkter for denne saken?`;
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
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
  const urlLabel = task.source === "asana" ? "Asana" : "SF";
  lines.push(`${urlLabel}: ${task.externalUrl}`);

  return lines.join("\n");
}

function SourceIcon({ source, className }: { source: Source; className?: string }) {
  const cls = className ?? "h-4 w-4 shrink-0";
  if (source === "salesforce") {
    return (
      <svg viewBox="0 0 24 16" fill="currentColor" className={cls} aria-hidden>
        <path d="M19.35 6.04C18.67 2.59 15.64 0 12 0 9.11 0 6.6 1.64 5.35 4.04 2.34 4.36 0 6.91 0 10c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
      </svg>
    );
  }
  if (source === "asana") {
    return (
      <svg viewBox="0 0 24 22" fill="currentColor" className={cls} aria-hidden>
        <circle cx="12" cy="4.5" r="4.5" />
        <circle cx="4.5" cy="17" r="4.5" />
        <circle cx="19.5" cy="17" r="4.5" />
      </svg>
    );
  }
  if (source === "outlook") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 7l10 7 10-7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cls} aria-hidden>
      <path d="M17.5 3h-11A3.5 3.5 0 003 6.5v11A3.5 3.5 0 006.5 21h11a3.5 3.5 0 003.5-3.5v-11A3.5 3.5 0 0017.5 3zM8 8h8v2h-3v7h-2v-7H8V8z" />
    </svg>
  );
}

function PriorityDot({
  priority,
  onChange,
}: {
  priority: Priority;
  onChange?: (next: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = PRIORITY_META[priority];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const timer = window.setTimeout(() => {
      window.addEventListener("click", close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", close);
    };
  }, [open]);

  if (!onChange) {
    return (
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
        title={`Prioritet: ${meta.label}`}
        aria-label={`Prioritet ${meta.label}`}
      />
    );
  }

  return (
    <span className="relative inline-flex shrink-0">
      <span
        role="button"
        tabIndex={0}
        aria-label={`Endre prioritet (nå ${meta.label})`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="-m-1 inline-grid h-5 w-5 cursor-pointer place-items-center rounded-full p-1 hover:bg-zinc-800/70"
        title={`Prioritet: ${meta.label} (tap for å endre)`}
      >
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      </span>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-7 z-20 flex gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 shadow-lg"
          role="menu"
        >
          {(["high", "medium", "low"] as Priority[]).map((p) => {
            const active = p === priority;
            const pmeta = PRIORITY_META[p];
            return (
              <button
                key={p}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(p);
                  setOpen(false);
                }}
                className={`grid h-7 w-7 place-items-center rounded-full ring-1 transition ${
                  active
                    ? "ring-zinc-300"
                    : "ring-zinc-700 hover:ring-zinc-500"
                }`}
                aria-label={`Sett prioritet ${pmeta.label}`}
                title={pmeta.label}
              >
                <span className={`h-3 w-3 rounded-full ${pmeta.dot}`} />
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

function DetailsPanel({
  details,
  caseNumber,
  relatedCases,
  onJumpToCase,
}: {
  details: CaseDetails;
  caseNumber?: string;
  relatedCases: Task[];
  onJumpToCase: (id: string) => void;
}) {
  type Row = {
    label: string;
    value?: string;
    flag?: "inherited";
    href?: string;
  };
  const rows: Row[] = [
    { label: "Saksnummer", value: caseNumber },
    { label: "Kunde", value: details.kunde },
    { label: "Konto-type", value: details.kontoType },
    { label: "Kontaktperson", value: details.kontaktperson },
    {
      label: "Bygg",
      value: details.bygg,
      flag: details.byggInherited ? "inherited" : undefined,
      href:
        details.bygg && isAddressLike(details.bygg)
          ? buildMapsUrl(details.bygg)
          : undefined,
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
          const valueClass = `whitespace-pre-line text-sm ${
            inherited ? "italic text-zinc-400" : "text-zinc-200"
          }`;
          const trailing = inherited ? (
            <span className="ml-2 inline-block rounded bg-zinc-800 px-1.5 py-0.5 align-middle text-[10px] font-medium not-italic text-zinc-400 ring-1 ring-zinc-700">
              fra kunde
            </span>
          ) : null;
          return (
            <div key={row.label} className="flex flex-col">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {row.label}
              </dt>
              {row.href ? (
                <dd className={valueClass}>
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-zinc-600 underline-offset-2 hover:text-sky-300 hover:decoration-sky-400"
                  >
                    {row.value}
                  </a>
                  {trailing}
                </dd>
              ) : (
                <dd className={valueClass}>
                  {row.value}
                  {trailing}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      {relatedCases.length > 0 && (
        <div className="mt-3 flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Andre åpne saker hos kunde ({relatedCases.length})
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {relatedCases.map((t) => {
              const info = getCaseInfo(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onJumpToCase(t.id)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 ring-1 ring-zinc-700 transition hover:bg-zinc-700 hover:text-zinc-100"
                >
                  {t.priority && (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_META[t.priority].dot}`}
                    />
                  )}
                  <span className="tabular-nums text-zinc-500">
                    {info.caseNumber}
                  </span>
                  <span className="truncate">{t.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
  priority,
  isDone,
  isExpanded,
  detailsOpen,
  filter,
  onToggleDone,
  onToggleExpanded,
  onToggleDetails,
  onJumpToCase,
  onChangePriority,
  onToggleSnooze,
  isSnoozedExternally,
  relatedCases,
  today,
  nowMs,
}: {
  task: Task;
  priority: Priority | undefined;
  isDone: boolean;
  isExpanded: boolean;
  detailsOpen: boolean;
  filter: Filter;
  onToggleDone: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onToggleDetails: () => void;
  onJumpToCase: (id: string) => void;
  onChangePriority: (id: string, next: Priority) => void;
  onToggleSnooze: (id: string) => void;
  isSnoozedExternally: boolean;
  relatedCases: Task[];
  today: string;
  nowMs: number;
}) {
  const [copied, setCopied] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const accent = SOURCE_CARD[task.source];
  const wasLongPressRef = useRef(false);

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

  const due = formatDue(task.dueAt, today);
  const overdue = task.dueAt !== undefined && task.dueAt < today && !isDone;
  const isExpandable = task.source === "salesforce" || task.source === "asana";
  const asanaArea = task.context
    ? task.context.split(" · ").filter((p) => !KNOWN_STATUSES.has(p)).join(" · ")
    : null;
  const caseInfo = getCaseInfo(task);
  const ago = timeSinceUpdate(task, nowMs);
  const isWaiting = actionOwnerRank(task) === 1;
  const isMinTur = actionOwnerRank(task) === 0;
  const ageMs = task.lastModifiedAt
    ? nowMs - Date.parse(task.lastModifiedAt)
    : 0;
  const autoDimmed =
    !isDone && isWaiting && task.lastModifiedAt !== undefined && ageMs <= STALE_THRESHOLD_MS;
  const dimmed = !isDone && (autoDimmed || isSnoozedExternally);

  function startLongPress() {
    wasLongPressRef.current = false;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      onToggleSnooze(task.id);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(40);
      }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleBodyClick(e: React.MouseEvent) {
    if (wasLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      wasLongPressRef.current = false;
      return;
    }
    onToggleExpanded(task.id);
  }

  const body = (
    <div className="flex min-w-0 items-start gap-2">
      {priority && (
        <span className="mt-0.5">
          <PriorityDot
            priority={priority}
            onChange={(next) => onChangePriority(task.id, next)}
          />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-[15px] font-medium leading-snug text-zinc-100 ${
            isDone ? "line-through" : ""
          }`}
        >
          {task.title}
        </p>
        {(caseInfo.customer || caseInfo.status || due) && (
          <div className="mt-1.5 flex min-w-0 items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium text-sky-300">
              {caseInfo.customer ?? ""}
            </span>
            {caseInfo.status && (
              <span className={`shrink-0 ${statusColorClass(caseInfo.status)}`}>
                {statusDisplayLabel(caseInfo.status)}
              </span>
            )}
            {due && (
              <span
                className={`shrink-0 tabular-nums ${
                  overdue ? "text-rose-400" : "text-zinc-400"
                }`}
              >
                {due}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <li
      id={`task-${task.id}`}
      className={`group rounded-2xl border p-3 shadow-lg shadow-black/20 backdrop-blur-sm transition ${
        isExpanded
          ? `${accent.expandedBorder} bg-zinc-900/80 ${accent.expandedShadow}`
          : isMinTur
            ? `border-amber-500/25 ${accent.bg}`
            : `${accent.border} ${accent.bg}`
      } ${isDone ? "opacity-50" : dimmed ? "opacity-50" : ""}`}
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
            onClick={handleBodyClick}
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            aria-expanded={isExpanded}
            className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-xl p-1 text-left active:bg-zinc-800/60"
          >
            <div className="min-w-0 flex-1">{body}</div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
              {ago && (
                <span className="text-[11px] font-medium tabular-nums text-zinc-400">
                  {ago}
                </span>
              )}
              <svg
                viewBox="0 0 16 16"
                className={`h-4 w-4 text-zinc-500 transition-transform ${
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
            </div>
          </button>
        ) : (
          <a
            href={task.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-xl p-1 active:bg-zinc-800/60"
          >
            <div className="min-w-0 flex-1">{body}</div>
            {ago && (
              <span className="shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-zinc-400">
                {ago}
              </span>
            )}
          </a>
        )}
      </div>

      {isExpanded && task.source === "asana" && (
        <div className={`mt-3 ml-9 border-l-2 ${accent.innerLine} pl-3`}>
          {asanaArea && (
            <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${accent.accentText}`}>
              {asanaArea}
            </p>
          )}
          <p className="text-sm leading-relaxed text-zinc-300">
            {task.summary ?? "Ingen beskrivelse tilgjengelig."}
          </p>
          {due && (
            <p className={`mt-1.5 text-xs ${overdue ? "text-rose-400" : "text-zinc-500"}`}>
              Frist: {due}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-200 ring-1 ring-red-500/30 transition hover:bg-red-500/25"
            >
              Åpne i Asana
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h7v7M13 3l-9 9" />
              </svg>
            </a>
            <button
              type="button"
              onClick={handleShareClaude}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
                copied
                  ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                  : "bg-zinc-800 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"
              }`}
              aria-live="polite"
            >
              {copied ? "Kopiert" : "Kopier til Claude"}
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          </div>
        </div>
      )}

      {isExpanded && task.source === "salesforce" && (
        <div className={`mt-3 ml-9 border-l-2 ${accent.innerLine} pl-3`}>
          <p className="text-sm leading-relaxed text-zinc-300">
            {task.summary ?? "Ingen beskrivelse tilgjengelig."}
            {task.analysis && (
              <button
                type="button"
                onClick={() => setAnalysisOpen((v) => !v)}
                className="ml-1 inline-block w-[58px] text-left text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                {analysisOpen ? "Mindre" : "Mer.."}
              </button>
            )}
          </p>
          {analysisOpen && (task.analysis || task.lastMessage) && (
            <div className={`mt-2 space-y-3 rounded-lg border-l-2 ${accent.innerLine} ${accent.analysisBg} px-3 py-2`}>
              {task.lastMessage && (
                <div>
                  <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${accent.accentText}`}>
                    Siste melding
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-200">
                    <span className="font-medium">
                      {task.lastMessage.from}:
                    </span>{" "}
                    {task.lastMessage.preview}
                  </p>
                </div>
              )}
              {task.analysis && (
                <div>
                  <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${accent.accentText}`}>
                    Hva skal gjøres
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
                    {task.analysis}
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 ring-1 ring-sky-500/30 transition hover:bg-sky-500/25"
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
              <a
                href={buildAskClaudeUrl(task)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
              >
                Spør Claude
                <svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2v-2H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
                </svg>
              </a>
              <button
                type="button"
                onClick={handleShareClaude}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
                  copied
                    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                    : "bg-zinc-800 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"
                }`}
                aria-live="polite"
              >
                {copied ? "Kopiert" : "Kopier"}
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
              {task.details && (
                <button
                  type="button"
                  onClick={onToggleDetails}
                  aria-expanded={detailsOpen}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-zinc-700 transition hover:bg-zinc-700"
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
            </div>
            {task.amestoEmail && (
              <a
                href={buildAmestoMailto(task.amestoEmail)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25"
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
            <DetailsPanel
              details={task.details}
              caseNumber={caseInfo.caseNumber}
              relatedCases={relatedCases}
              onJumpToCase={onJumpToCase}
            />
          )}
        </div>
      )}
    </li>
  );
}

export default function Dashboard({
  tasks,
  today,
  now,
}: {
  tasks: Task[];
  today: string;
  now: string;
}) {
  const nowMs = Date.parse(now);
  const [filter, setFilter] = useState<Filter>("all");
  const [sfBucket, setSfBucket] = useState<SfBucket>("faktura");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, Priority>
  >({});
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});
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
    try {
      const stored = window.localStorage.getItem(PRIORITY_OVERRIDES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (parsed && typeof parsed === "object") {
          setPriorityOverrides(parsed as Record<string, Priority>);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    try {
      const stored = window.localStorage.getItem(SNOOZED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (parsed && typeof parsed === "object") {
          setSnoozed(parsed as Record<string, string>);
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

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        PRIORITY_OVERRIDES_KEY,
        JSON.stringify(priorityOverrides),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [priorityOverrides, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SNOOZED_KEY, JSON.stringify(snoozed));
    } catch {
      /* ignore quota errors */
    }
  }, [snoozed, hydrated]);

  function isSnoozed(task: Task): boolean {
    const since = snoozed[task.id];
    if (!since) return false;
    if (!task.lastModifiedAt) return true;
    return task.lastModifiedAt <= since;
  }

  function toggleSnooze(taskId: string) {
    setSnoozed((prev) => {
      if (prev[taskId]) {
        const next = { ...prev };
        delete next[taskId];
        return next;
      }
      const task = tasks.find((t) => t.id === taskId);
      const since = task?.lastModifiedAt ?? new Date().toISOString();
      return { ...prev, [taskId]: since };
    });
  }

  function getPriority(task: Task): Priority | undefined {
    return priorityOverrides[task.id] ?? task.priority;
  }

  function setPriority(taskId: string, next: Priority) {
    setPriorityOverrides((prev) => ({ ...prev, [taskId]: next }));
  }

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

  const priorityCounts = useMemo(() => {
    const c: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const p = priorityOverrides[t.id] ?? t.priority;
      if (p) c[p] += 1;
    }
    return c;
  }, [tasks, done, priorityOverrides]);

  const isDimmedCard = (task: Task): boolean => {
    if (actionOwnerRank(task) !== 1) return false;
    if (!task.lastModifiedAt) return false;
    const ageMs = nowMs - Date.parse(task.lastModifiedAt);
    return ageMs <= STALE_THRESHOLD_MS;
  };

  const sortFn = (a: Task, b: Task): number => {
    const ao = actionOwnerRank(a) - actionOwnerRank(b);
    if (ao !== 0) return ao;
    // Innen seksjon: tydelige (ikke dempet) først
    const ad = isDimmedCard(a) ? 1 : 0;
    const bd = isDimmedCard(b) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    const ap = priorityRank(priorityOverrides[a.id] ?? a.priority);
    const bp = priorityRank(priorityOverrides[b.id] ?? b.priority);
    if (ap !== bp) return ap - bp;
    return lastModifiedTime(a) - lastModifiedTime(b);
  };

  const tasksByCustomer = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const customer = getCaseInfo(t).customer;
      if (!customer) continue;
      const list = map.get(customer) ?? [];
      list.push(t);
      map.set(customer, list);
    }
    return map;
  }, [tasks, done]);

  function relatedCasesFor(task: Task): Task[] {
    const customer = getCaseInfo(task).customer;
    if (!customer) return [];
    return (tasksByCustomer.get(customer) ?? []).filter(
      (t) => t.id !== task.id,
    );
  }

  function jumpToCase(id: string) {
    setExpandedId(id);
    setDetailsOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(`task-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const sfBucketCounts = useMemo(() => {
    const c: Record<SfBucket, number> = {
      faktura: 0,
      kreditnota: 0,
      garanti: 0,
      annet: 0,
    };
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const b = bucketFor(t);
      if (b) c[b] += 1;
    }
    return c;
  }, [tasks, done]);

  const visibleSf = useMemo(() => {
    return tasks.filter(
      (t) => t.source === "salesforce" && bucketFor(t) === sfBucket,
    );
  }, [tasks, sfBucket]);

  const visible = useMemo(() => {
    let list: Task[];
    if (filter === "all") list = tasks;
    else if (filter === "salesforce") list = visibleSf;
    else list = tasks.filter((t) => t.source === filter);
    return list.slice().sort(sortFn);
  }, [tasks, filter, visibleSf, priorityOverrides]);

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
      <header className="mb-7">
        <h1 className="text-[28px] font-semibold tracking-tight text-zinc-50">
          Arbeidsoppgaver
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
          <span>
            {counts.all} {counts.all === 1 ? "oppgave igjen" : "oppgaver igjen"}
          </span>
          {priorityCounts.high > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              {priorityCounts.high}
            </span>
          )}
          {priorityCounts.medium > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {priorityCounts.medium}
            </span>
          )}
          {priorityCounts.low > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {priorityCounts.low}
            </span>
          )}
        </div>
      </header>

      <div
        className="-mx-4 mb-0 flex gap-2 overflow-x-auto px-4 pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Kilder"
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          const label = f === "all" ? "Alle" : SOURCE_META[f].label;
          const tabStyle = f !== "all" ? SOURCE_TAB[f] : null;
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={`flex shrink-0 items-center gap-2 px-4 py-2 text-sm font-medium transition ${
                active
                  ? tabStyle
                    ? tabStyle.active
                    : "rounded-full border border-zinc-300 bg-zinc-100 text-zinc-900"
                  : tabStyle
                    ? tabStyle.inactive
                    : "rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {f !== "all" && (
                <SourceIcon source={f} className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{label}</span>
              <span className={`text-xs tabular-nums ${
                active
                  ? tabStyle ? tabStyle.badge : "text-zinc-600"
                  : "text-zinc-500"
              }`}>
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      <div className={FULL_SHELL[filter]}>
      {showSfTabs && (
        <div
          className="mb-5 flex gap-1 rounded-xl bg-zinc-900/60 p-1 ring-1 ring-zinc-800"
          role="tablist"
          aria-label="Salesforce-kategori"
        >
          {SF_BUCKETS.map((bucket) => {
            const active = sfBucket === bucket;
            return (
              <button
                key={bucket}
                role="tab"
                aria-selected={active}
                onClick={() => setSfBucket(bucket)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>{SF_BUCKET_LABEL[bucket]}</span>
                <span
                  className={`tabular-nums ${
                    active ? "text-sky-300/80" : "text-zinc-500"
                  }`}
                >
                  {sfBucketCounts[bucket]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          Ingen oppgaver her. Nyt stillheten.
        </div>
      ) : (
        (() => {
          const minTur = visible.filter((t) => actionOwnerRank(t) === 0);
          const venter = visible.filter((t) => actionOwnerRank(t) === 1);
          const ukjent = visible.filter((t) => actionOwnerRank(t) === 2);
          const renderCard = (task: Task) => (
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
              onJumpToCase={jumpToCase}
              onChangePriority={setPriority}
              onToggleSnooze={toggleSnooze}
              isSnoozedExternally={isSnoozed(task)}
              priority={priorityOverrides[task.id] ?? task.priority}
              relatedCases={relatedCasesFor(task)}
              today={today}
              nowMs={nowMs}
            />
          );
          return (
            <div className="flex flex-col gap-5">
              {minTur.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Min tur
                    <span className="text-amber-400/70">({minTur.length})</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {minTur.map(renderCard)}
                  </ul>
                </section>
              )}
              {venter.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    Avventer
                    <span className="text-zinc-600">({venter.length})</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {venter.map(renderCard)}
                  </ul>
                </section>
              )}
              {ukjent.length > 0 && (
                <section>
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Annet ({ukjent.length})
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {ukjent.map(renderCard)}
                  </ul>
                </section>
              )}
            </div>
          );
        })()
      )}
      </div>
    </div>
  );
}
