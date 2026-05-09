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
  type OutlookCategory,
  type Priority,
  type Source,
  type Task,
} from "@/lib/tasks";

type Filter = Source | "all";
type SfBucket = "alle" | "faktura" | "kreditnota" | "garanti" | "annet";
type OutlookBucket = OutlookCategory;

const FILTERS: Filter[] = ["all", "salesforce", "asana", "outlook", "teams"];
const SF_BUCKETS: SfBucket[] = ["alle", "faktura", "kreditnota", "garanti", "annet"];
const OUTLOOK_BUCKETS: OutlookBucket[] = ["trenger-oppfolging", "kopi", "til-info"];
const OUTLOOK_BUCKET_LABEL: Record<OutlookBucket, string> = {
  "trenger-oppfolging": "Oppfølging",
  "kopi": "Kopi",
  "til-info": "Til info",
};

const DONE_STORAGE_KEY = "mitt-dashboard:done:v1";
const PRIORITY_OVERRIDES_KEY = "mitt-dashboard:priority-overrides:v1";
const SNOOZED_KEY = "mitt-dashboard:snoozed:v1";
const LONG_PRESS_MS = 600;

const SOURCE_TAB: Partial<Record<Filter, { inactive: string; active: string; badge: string }>> = {
  salesforce: {
    inactive: "rounded-full border border-sky-600/60 bg-sky-900/70 text-sky-200 hover:bg-sky-800/70",
    active:   "rounded-xl border border-sky-400/50 bg-sky-500/20 text-sky-50",
    badge: "text-sky-300/80",
  },
  asana: {
    inactive: "rounded-full border border-red-700/60 bg-red-900/70 text-red-200 hover:bg-red-800/70",
    active:   "rounded-xl border border-red-400/50 bg-red-500/25 text-red-50",
    badge: "text-red-300/80",
  },
  outlook: {
    inactive: "rounded-full border border-amber-600/60 bg-amber-900/70 text-amber-200 hover:bg-amber-800/70",
    active:   "rounded-xl border border-amber-400/50 bg-amber-500/20 text-amber-50",
    badge: "text-amber-300/80",
  },
  teams: {
    inactive: "rounded-full border border-violet-600/60 bg-violet-900/70 text-violet-200 hover:bg-violet-800/70",
    active:   "rounded-xl border border-violet-400/50 bg-violet-500/20 text-violet-50",
    badge: "text-violet-300/80",
  },
};

const FULL_SHELL: Record<Filter, string> = {
  all:        "rounded-2xl border border-white/20 bg-white/20 p-3 mt-2",
  salesforce: "rounded-2xl border border-sky-400/50 bg-sky-500/20 p-3 mt-2",
  asana:      "rounded-2xl border border-red-400/50 bg-red-500/25 p-3 mt-2",
  outlook:    "rounded-2xl border border-amber-400/50 bg-amber-500/20 p-3 mt-2",
  teams:      "rounded-2xl border border-violet-400/50 bg-violet-500/20 p-3 mt-2",
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
  alle: "Alle",
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

// Salesforce logger e-poster som sendes til/fra kunde@mustadeiendom.no automatisk.
// Ref-taggen i body knytter e-posten til riktig sak.
const SF_LOGGING_CC = "kunde@mustadeiendom.no";
const sfRef = (id: string) =>
  `ref:!00D1t0osHt.!${id.slice(0, 6)}${id.slice(10, 15)}:ref`;

function buildAmestoMailto(email: AmestoEmail, taskId: string): string {
  const body = `${email.body}\n\n${sfRef(taskId)}`;
  return (
    `mailto:${AMESTO_RECIPIENT}` +
    `?cc=${encodeURIComponent(SF_LOGGING_CC)}` +
    `&subject=${encodeURIComponent(email.subject)}` +
    `&body=${encodeURIComponent(body)}`
  );
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

function threadDate(task: Task): number {
  const last = task.thread?.[task.thread.length - 1];
  if (!last?.date) return 0;
  const [d, m] = last.date.split(".").map(Number);
  if (!d || !m) return 0;
  const now = new Date();
  const year = m > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
  return Date.UTC(year, m - 1, d, 10, 0, 0);
}

function lastModifiedTime(task: Task): number {
  if (task.lastModifiedAt) {
    const t = Date.parse(task.lastModifiedAt);
    const asDate = new Date(t);
    const isMidnightPlaceholder =
      asDate.getUTCHours() === 0 &&
      asDate.getUTCMinutes() === 0 &&
      asDate.getUTCSeconds() === 0;
    if (!isMidnightPlaceholder) return t;
  }
  return threadDate(task) || (task.lastModifiedAt ? Date.parse(task.lastModifiedAt) : 0);
}

function priorityRank(priority: Priority | undefined): number {
  return priority ? PRIORITY_META[priority].rank : 9;
}

function actionOwnerRank(task: Task): number {
  if (task.awaiting === "deg!") return 0;
  if (task.awaiting) return 1;
  const status = getCaseInfo(task).status;
  if (status === "Ny" || status === "Iverksettes") return 0;
  if (status === "Avventer kunde" || status === "Avventer Kunde") return 1;
  // SF-saker uten eksplisitt awaiting er alltid Mortens tur – ingen andre eier saken
  if (task.source === "salesforce") return 0;
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

function shortName(name: string): string {
  const match = name.match(/^(.+?)\s*\((.+)\)$/);
  if (match && match[1].includes(" ")) return match[2];
  return name;
}

function timeSinceUpdate(task: Task, nowMs: number): string | null {
  if (!task.lastModifiedAt) return null;
  const diffMs = nowMs - lastModifiedTime(task);
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "< 1t";
  if (hours < 24) return `${hours}t`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}u`;
  return `${Math.floor(days / 30)}m`;
}

function parseContactEmail(kontaktperson: string | undefined): string | null {
  if (!kontaktperson) return null;
  const match = kontaktperson.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

function buildSfReplyMailto(task: Task): string {
  const to = parseContactEmail(task.details?.kontaktperson) ?? "";
  const subject = `SV: ${task.title}`;
  const lines: string[] = ["", ""];
  if (task.thread && task.thread.length > 0) {
    for (const msg of [...task.thread].reverse()) {
      lines.push("________________________________________");
      lines.push(`${msg.date}  ${msg.from}`);
      lines.push(msg.preview);
      lines.push("");
    }
  }
  lines.push(sfRef(task.id));
  return (
    `mailto:${to}` +
    `?cc=${encodeURIComponent(SF_LOGGING_CC)}` +
    `&subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(lines.join("\n"))}`
  );
}

function buildAskClaudeUrl(task: Task): string {
  const context = buildClaudeShareText(task);
  const prompt = `${context}\n\nKan du foreslå konkrete oppfølgingspunkter for denne saken?`;
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

function buildClaudeShareText(task: Task): string {
  const lines: string[] = [];
  const caseInfo = getCaseInfo(task);
  lines.push(task.title);
  lines.push("");

  const customer = task.details?.kunde ?? caseInfo.customer;
  if (customer) lines.push(`• Kunde: ${customer}`);
  if (task.details?.bygg) lines.push(`• Bygg: ${task.details.bygg}`);
  if (task.topic) lines.push(`• Kategori: ${TOPIC_META[task.topic].label}`);

  if (task.summary) {
    task.summary.split("\n").filter(Boolean).forEach((line) => lines.push(`• ${line}`));
  }

  if (task.awaiting) lines.push(`• Avventer: ${task.awaiting}`);

  if (task.details) {
    const d = task.details;
    if (d.note) {
      lines.push("");
      lines.push(`Merk: ${d.note}`);
    }
  }

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

  const indicator =
    priority === "high" ? (
      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full border border-zinc-600" />
    );

  if (!onChange) {
    return (
      <span
        className="inline-grid h-4 w-4 shrink-0 place-items-center"
        title={`Prioritet: ${meta.label}`}
        aria-label={`Prioritet ${meta.label}`}
      >
        {indicator}
      </span>
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
        {indicator}
      </span>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-7 z-20 flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 shadow-lg"
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
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? p === "high"
                      ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30"
                      : p === "medium"
                        ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
                aria-label={`Sett prioritet ${pmeta.label}`}
              >
                {pmeta.label}
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
  const isExpandable = task.source === "salesforce" || task.source === "asana" || task.source === "outlook";
  const asanaArea = task.context
    ? task.context.split(" · ").filter((p) => !KNOWN_STATUSES.has(p)).join(" · ")
    : null;
  const caseInfo = getCaseInfo(task);
  const ago = timeSinceUpdate(task, nowMs);
  const isWaiting = actionOwnerRank(task) === 1;
  const isMinTur = actionOwnerRank(task) === 0;
  const isCloseable = task.closeable === true;
  const ageMs = task.lastModifiedAt
    ? nowMs - Date.parse(task.lastModifiedAt)
    : 0;
  const dimmed = !isDone && !isCloseable && (isWaiting || isSnoozedExternally);

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
      <div className="min-w-0 flex-1">
        <p
          className={`text-[15px] font-medium leading-snug text-zinc-100 ${
            isDone ? "line-through" : ""
          }`}
        >
          {task.title}
        </p>
        {(caseInfo.customer || caseInfo.status || due || task.awaiting || task.closeable || priority === "high") && (
          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium text-sky-300">
              {caseInfo.customer ?? ""}
            </span>
            {priority === "high" && (
              <span className="shrink-0 text-[11px] font-semibold text-rose-400">Kritisk</span>
            )}
            {task.closeable ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/25">
                ✓ Kan lukkes
              </span>
            ) : task.awaiting === "deg!" || (!task.awaiting && actionOwnerRank(task) === 0) ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 bg-amber-500/15 text-amber-300 ring-amber-500/25">
                ▸ Din tur
              </span>
            ) : task.awaiting ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 bg-zinc-800/80 text-zinc-400 ring-zinc-700/60">
                {`Avventer ${task.awaiting}`}
              </span>
            ) : (
              <>
                {caseInfo.status && caseInfo.status !== "Ny" && caseInfo.status !== "Avventer kunde" && caseInfo.status !== "Avventer Kunde" && (
                  <span className={`shrink-0 ${statusColorClass(caseInfo.status)}`}>
                    {statusDisplayLabel(caseInfo.status)}
                  </span>
                )}
                {due && (
                  <span className={`shrink-0 tabular-nums ${overdue ? "text-rose-400" : "text-zinc-400"}`}>
                    {due}
                  </span>
                )}
              </>
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
          : isCloseable
            ? "border-emerald-500/25 bg-emerald-500/5"
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
                <span className="text-xs font-semibold tabular-nums text-zinc-300">
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
              <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-zinc-300">
                {ago}
              </span>
            )}
          </a>
        )}
      </div>

      {isExpanded && task.source === "outlook" && (() => {
        const senderEmail = task.context?.split(" · ")[0] ?? "";
        const quotedBody = task.analysis
          ? `\n\n________________________________________\nFra: ${task.lastMessage?.from ?? senderEmail}\n\n${task.analysis}`
          : "";
        const replyHref = `mailto:${senderEmail}?subject=SV%3A%20${encodeURIComponent(task.title)}${quotedBody ? `&body=${encodeURIComponent(quotedBody)}` : ""}`;
        return (
          <div className={`mt-3 ml-9 border-l-2 ${accent.innerLine} pl-3`}>
            {task.outlookCategory && (
              <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${accent.accentText}`}>
                {task.outlookCategory === "trenger-oppfolging" ? "Trenger oppfølging" : task.outlookCategory === "kopi" ? "Kopi" : "Til info"}
              </p>
            )}
            <p className="text-sm leading-relaxed text-zinc-300">
              {task.summary ?? "Ingen beskrivelse tilgjengelig."}
              {(task.analysis || task.lastMessage) && (
                <button
                  type="button"
                  onClick={() => setAnalysisOpen((v) => !v)}
                  className="ml-1 inline-block w-[58px] text-left text-xs font-medium text-amber-400 hover:text-amber-300"
                >
                  {analysisOpen ? "Mindre" : "Mer.."}
                </button>
              )}
            </p>
            {analysisOpen && (
              <div className={`mt-2 rounded-lg border-l-2 ${accent.innerLine} ${accent.analysisBg} px-3 py-2 text-sm leading-relaxed text-zinc-300`}>
                {task.analysis && <p className="mb-2">{task.analysis}</p>}
                {task.lastMessage && (
                  <p className="text-xs text-zinc-400 italic">
                    <span className="font-medium not-italic text-zinc-300">{task.lastMessage.from}:</span>{" "}
                    {task.lastMessage.preview}
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <a
                href={replyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-100 ring-1 ring-amber-500/40 transition hover:bg-amber-500/30"
              >
                Svar
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10 L8 4 L8 7 C12 7 14 9 14 13 C12 10 9 9 8 9 L8 12 Z" />
                </svg>
              </a>
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700 transition hover:bg-zinc-700"
              >
                Åpne i Outlook
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
                {copied ? "✓ Kopiert" : "Kopier til Claude"}
              </button>
            </div>
          </div>
        );
      })()}

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
          {(task.thread && task.thread.length > 0) ? (
            <div className="space-y-0">
              {task.thread.map((msg, i) => {
                const isLast = i === task.thread!.length - 1;
                const isChatter = msg.from.includes("[Chatter]") || msg.from.includes("[via Chatter]");
                const cleanFrom = msg.from.replace(/\s*\[.*?\]/g, "").trim();
                const arrowIdx = cleanFrom.indexOf(" → ");
                let sender: string;
                let recipient: string;
                if (arrowIdx !== -1) {
                  sender = cleanFrom.slice(0, arrowIdx);
                  recipient = cleanFrom.slice(arrowIdx + 3);
                } else {
                  sender = cleanFrom;
                  const isFromMorten = cleanFrom === "Morten" || cleanFrom.startsWith("Morten ");
                  const isFromInternal = cleanFrom.includes("(Amesto)") || cleanFrom.includes("(Mustad)") || isChatter;
                  if (isFromMorten) {
                    recipient = getCaseInfo(task).customer ?? task.details?.kunde?.split(" · ")[0] ?? "kunden";
                  } else if (isFromInternal) {
                    recipient = "Morten";
                  } else {
                    recipient = "Morten";
                  }
                }
                return (
                  <div key={i} className="relative pl-5 pb-3">
                    {i < task.thread!.length - 1 && (
                      <span className="absolute left-[7px] top-3 bottom-0 w-px bg-zinc-700" />
                    )}
                    {isLast && (
                      <span className="absolute left-0 top-1 h-3.5 w-3.5 animate-ping rounded-full border-2 border-sky-400 opacity-60" />
                    )}
                    <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${
                      isLast
                        ? "border-sky-400 bg-sky-400/20"
                        : msg.resolved
                        ? "border-emerald-500 bg-emerald-500/20"
                        : "border-zinc-600 bg-zinc-900"
                    }`} />
                    <div className="text-xs leading-snug">
                      <div className="flex items-baseline gap-1">
                        <span className={`font-semibold ${isLast ? "text-zinc-100" : msg.resolved ? "text-emerald-400" : "text-zinc-200"}`}>{shortName(sender)}</span>
                        <span className={msg.resolved ? "text-emerald-700" : "text-zinc-400"}>→</span>
                        <span className={msg.resolved ? "text-emerald-600" : isLast ? "text-zinc-400" : "text-zinc-400"}>{shortName(recipient)}</span>
                        <span className="ml-auto tabular-nums text-zinc-500">{msg.date}</span>
                      </div>
                      <p className={`mt-0.5 ${isLast ? "text-zinc-300" : msg.resolved ? "text-emerald-600/80" : "text-zinc-400"}`}>{msg.preview}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : task.lastMessage ? (
            <p className="text-sm leading-relaxed text-zinc-200">
              <span className="font-semibold">{task.lastMessage.from}:</span>{" "}
              {task.lastMessage.preview}
            </p>
          ) : task.summary ? (
            <p className="text-sm leading-relaxed text-zinc-300">{task.summary}</p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 ring-1 ring-sky-500/30 transition hover:bg-sky-500/25"
              >
                Åpne i SF
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
                className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium ring-1 transition ${
                  copied
                    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                    : "bg-zinc-800 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"
                }`}
                aria-live="polite"
              >
                {copied ? "✓ Kopiert" : "Kopier til Claude"}
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
                href={buildAmestoMailto(task.amestoEmail, task.id)}
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
            <a
              href={buildSfReplyMailto(task)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
            >
              Svar til kunde
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10 L8 4 L8 7 C12 7 14 9 14 13 C12 10 9 9 8 9 L8 12 Z" />
              </svg>
            </a>
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
  const [outlookBucket, setOutlookBucket] = useState<OutlookBucket>("trenger-oppfolging");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, Priority>
  >({});
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) =>
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s; });
  const [search, setSearch] = useState("");

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
    return actionOwnerRank(task) === 1;
  };

  const sortFn = (a: Task, b: Task): number => {
    const effectiveRank = (t: Task) => {
      const r = actionOwnerRank(t);
      return t.closeable && r > 0 ? 0.5 : r;
    };
    const ao = effectiveRank(a) - effectiveRank(b);
    if (ao !== 0) return ao;
    // Within rank 0: explicit "deg!" above status-based items
    const aDeg = a.awaiting === "deg!" ? 0 : 1;
    const bDeg = b.awaiting === "deg!" ? 0 : 1;
    if (aDeg !== bDeg) return aDeg - bDeg;
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
      alle: 0,
      faktura: 0,
      kreditnota: 0,
      garanti: 0,
      annet: 0,
    };
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const b = bucketFor(t);
      if (b) { c[b] += 1; c.alle += 1; }
    }
    return c;
  }, [tasks, done]);

  const outlookBucketCounts = useMemo(() => {
    const c: Record<OutlookBucket, number> = {
      "trenger-oppfolging": 0,
      "kopi": 0,
      "til-info": 0,
    };
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      if (t.source === "outlook" && t.outlookCategory) c[t.outlookCategory] += 1;
    }
    return c;
  }, [tasks, done]);

  const visibleSf = useMemo(() => {
    return tasks.filter(
      (t) => t.source === "salesforce" && (sfBucket === "alle" || bucketFor(t) === sfBucket),
    );
  }, [tasks, sfBucket]);

  const visible = useMemo(() => {
    let list: Task[];
    if (filter === "all") list = tasks;
    else if (filter === "salesforce") list = visibleSf;
    else if (filter === "outlook") list = tasks.filter((t) => t.source === "outlook" && t.outlookCategory === outlookBucket);
    else list = tasks.filter((t) => t.source === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.context?.toLowerCase().includes(q) ||
          t.details?.kunde?.toLowerCase().includes(q) ||
          t.caseNumber?.toLowerCase().includes(q)
      );
    }
    return list.slice().sort(sortFn);
  }, [tasks, filter, visibleSf, outlookBucket, priorityOverrides, search]);

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
  const showOutlookTabs = filter === "outlook";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:pt-10 md:max-w-5xl md:px-8">
      <header className="mb-7">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight text-zinc-50">
            Arbeidsoppgaver Morten
          </h1>
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              placeholder="Søk..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-32 rounded-full border border-zinc-700 bg-zinc-800/80 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500 focus:w-44 transition-all duration-200"
            />
          </div>
        </div>
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
        className="-mx-4 mb-0 flex gap-2 overflow-x-auto px-4 pb-0 leading-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Kilder"
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          const label = f === "all" ? "Alle" : SOURCE_META[f].label;
          const tabStyle = f !== "all" ? SOURCE_TAB[f] : {
            inactive: "rounded-full border border-zinc-400/40 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",
            active:   "rounded-xl border border-zinc-300/60 bg-zinc-700/40 text-white",
            badge: "text-zinc-300/80",
          };
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

      {showOutlookTabs && (
        <div
          className="mb-5 flex gap-1 rounded-xl bg-zinc-900/60 p-1 ring-1 ring-zinc-800"
          role="tablist"
          aria-label="Outlook-kategori"
        >
          {OUTLOOK_BUCKETS.map((bucket) => {
            const active = outlookBucket === bucket;
            return (
              <button
                key={bucket}
                role="tab"
                aria-selected={active}
                onClick={() => setOutlookBucket(bucket)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>{OUTLOOK_BUCKET_LABEL[bucket]}</span>
                <span className={`tabular-nums ${active ? "text-amber-300/80" : "text-zinc-500"}`}>
                  {outlookBucketCounts[bucket]}
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
                  <button
                    type="button"
                    onClick={() => toggleGroup("min-tur")}
                    className="mb-2 flex w-full items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-amber-300 hover:text-amber-200"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Min tur
                    <span className="text-amber-400/70">({minTur.length})</span>
                    <svg viewBox="0 0 16 16" className={`ml-auto h-3 w-3 transition-transform ${collapsedGroups.has("min-tur") ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                  {!collapsedGroups.has("min-tur") && (
                    <ul className="flex flex-col gap-2">{minTur.map(renderCard)}</ul>
                  )}
                </section>
              )}
              {venter.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => toggleGroup("avventer")}
                    className="mb-2 flex w-full items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    Avventer
                    <span className="text-zinc-600">({venter.length})</span>
                    <svg viewBox="0 0 16 16" className={`ml-auto h-3 w-3 transition-transform ${collapsedGroups.has("avventer") ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                  {!collapsedGroups.has("avventer") && (
                    <ul className="flex flex-col gap-2">{venter.map(renderCard)}</ul>
                  )}
                </section>
              )}
              {ukjent.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => toggleGroup("annet")}
                    className="mb-2 flex w-full items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400"
                  >
                    Annet ({ukjent.length})
                    <svg viewBox="0 0 16 16" className={`ml-auto h-3 w-3 transition-transform ${collapsedGroups.has("annet") ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                  {!collapsedGroups.has("annet") && (
                    <ul className="flex flex-col gap-2">{ukjent.map(renderCard)}</ul>
                  )}
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
