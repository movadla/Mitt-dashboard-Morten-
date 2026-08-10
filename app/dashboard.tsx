"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  AMESTO_RECIPIENT,
  PRIORITY_META,
  SOURCE_META,
  TOPIC_META,
  type AmestoEmail,
  type CaseDetails,
  type OutlookCategory,
  type Priority,
  type Source,
  type Task,
} from "@/lib/tasks";
import {
  BUILDINGS,
  CALENDAR_EVENTS,
  CONTRACTS,
  GUARANTEES,
  GUARANTEE_TOTAL,
  type GuaranteeStatus,
  PRIVAT_WIDGETS,
  RECEIVABLES,
  RECEIVABLES_TREND,
  formatDateDMY,
  formatKr,
  type WidgetSpec,
} from "@/lib/widgets";
import ChatWidget from "./ChatWidget";
import PrivatPanel from "./privat/PrivatPanel";

type Filter = Source | "all";
type SfBucket = "alle" | "faktura" | "kreditnota" | "garanti" | "annet";
type OutlookBucket = OutlookCategory;
type Mode = "jobb" | "privat";

const CARD_SHELL = "rounded-2xl border border-line bg-surface-1 shadow-md shadow-black/15";
const SECTION_SHELL = "border-t border-line pt-3 mt-3";

const MODE_STORAGE_KEY = "mitt-dashboard:mode:v1";
const KPI_COLLAPSED_KEY = "mitt-dashboard:kpi-collapsed:v1";
const CALENDAR_NOTES_KEY = "mitt-dashboard:calendar-notes:v1";

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

type SourceAccent = {
  dot: string;
  icon: string;
  soft: string;
  softText: string;
  softRing: string;
  divider: string;
};

const SOURCE_LABEL: Record<Source, string> = {
  salesforce: "Salesforce",
  asana: "Asana",
  outlook: "Outlook",
  teams: "Teams",
};

const SOURCE_ACCENT: Record<Source, SourceAccent> = {
  salesforce: {
    dot: "bg-accent",
    icon: "text-accent",
    soft: "bg-accent/12",
    softText: "text-accent",
    softRing: "ring-accent/25",
    divider: "border-accent/25",
  },
  asana: {
    dot: "bg-source-asana",
    icon: "text-source-asana",
    soft: "bg-source-asana/12",
    softText: "text-source-asana",
    softRing: "ring-source-asana/25",
    divider: "border-source-asana/25",
  },
  outlook: {
    dot: "bg-source-outlook",
    icon: "text-source-outlook",
    soft: "bg-source-outlook/12",
    softText: "text-source-outlook",
    softRing: "ring-source-outlook/25",
    divider: "border-source-outlook/25",
  },
  teams: {
    dot: "bg-source-teams",
    icon: "text-source-teams",
    soft: "bg-source-teams/12",
    softText: "text-source-teams",
    softRing: "ring-source-teams/25",
    divider: "border-source-teams/25",
  },
};

const GUARANTEE_STATUS_STYLE: Record<GuaranteeStatus, string> = {
  Mangler: "bg-status-danger/12 text-status-danger",
  Forespurt: "bg-status-warning/12 text-status-warning",
  Kommer: "bg-status-positive/12 text-status-positive",
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

function buildOutlookAskClaudeUrl(task: Task): string {
  const lines: string[] = [task.title, ""];
  if (task.summary) lines.push(task.summary, "");
  if (task.emailBody) lines.push("E-post:", task.emailBody);
  const prompt = lines.join("\n") + "\n\nKan du hjelpe meg med å svare på denne e-posten?";
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

function buildTeamsAskClaudeUrl(task: Task): string {
  const lines: string[] = [task.title, ""];
  if (task.summary) lines.push(task.summary, "");
  if (task.emailBody) lines.push("Melding:", task.emailBody);
  const prompt = lines.join("\n") + "\n\nKan du hjelpe meg å svare på denne Teams-meldingen?";
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

function buildOutlookAmestoMailto(task: Task): string {
  const subject = `Vs: ${task.title}`;
  const body = task.emailBody ?? task.summary ?? "";
  return `mailto:Mustad@amesto.no?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildOutlookForwardMailto(task: Task): string {
  const subject = `Vs: ${task.title}`;
  const body = task.emailBody ?? task.summary ?? "";
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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
    if (parts[i] && (KNOWN_STATUSES.has(parts[i]) || parts[i].startsWith("Avventer"))) {
      status = parts[i];
      i += 1;
    }
    customer = parts[i];
  }

  return { caseNumber, status, customer };
}

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
  if (task.awaiting === "deg!" || task.awaiting === "Morten") return 0;
  if (task.awaiting) return 1;
  const status = getCaseInfo(task).status;
  if (status === "Ny" || status === "Iverksettes") return 0;
  if (status === "Avventer kunde" || status === "Avventer Kunde") return 1;
  // SF- og Outlook-saker uten eksplisitt awaiting er alltid Mortens tur
  if (task.source === "salesforce" || task.source === "outlook") return 0;
  return 2;
}

function statusColorClass(status: string | undefined): string {
  if (status === "Ny") return "text-sky-300";
  if (status === "Iverksettes") return "text-amber-300";
  if (status === "Avventer kunde" || status === "Avventer Kunde")
    return "text-ink-3";
  return "text-ink-3";
}

function statusDisplayLabel(status: string | undefined): string | undefined {
  if (status === "Iverksettes") return "Venter";
  return status;
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
    <div className="mt-3 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
      {visibleRows.length === 0 && (
        <p className="text-xs text-ink-3">
          Ingen tilleggsinfo tilgjengelig.
        </p>
      )}
      <dl className="grid gap-2.5">
        {visibleRows.map((row) => {
          const inherited = row.flag === "inherited";
          const valueClass = `whitespace-pre-line text-sm ${
            inherited ? "italic text-ink-3" : "text-ink-2"
          }`;
          const trailing = inherited ? (
            <span className="ml-2 inline-block rounded bg-surface-2 px-1.5 py-0.5 align-middle text-2xs font-medium not-italic text-ink-3 ring-1 ring-line-strong">
              fra kunde
            </span>
          ) : null;
          return (
            <div key={row.label} className="flex flex-col">
              <dt className="text-2xs font-medium uppercase tracking-wider text-ink-3">
                {row.label}
              </dt>
              {row.href ? (
                <dd className={valueClass}>
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-line-strong underline-offset-2 hover:text-accent hover:decoration-accent"
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
          <span className="text-2xs font-medium uppercase tracking-wider text-ink-3">
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
                  className="inline-flex max-w-full items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-xs text-ink-2 ring-1 ring-line-strong transition hover:bg-surface-3 hover:text-ink-1"
                >
                  {t.priority && (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_META[t.priority].dot}`}
                    />
                  )}
                  <span className="tabular-nums text-ink-3">
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
  onToggleDone,
  onToggleExpanded,
  onToggleDetails,
  onJumpToCase,
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
  onToggleDone: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onToggleDetails: () => void;
  onJumpToCase: (id: string) => void;
  onToggleSnooze: (id: string) => void;
  isSnoozedExternally: boolean;
  relatedCases: Task[];
  today: string;
  nowMs: number;
}) {
  const [copied, setCopied] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const accent = SOURCE_ACCENT[task.source];
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
  const isExpandable = task.source === "salesforce" || task.source === "asana" || task.source === "outlook" || task.source === "teams";
  const asanaArea = task.context
    ? task.context.split(" · ").filter((p) => !KNOWN_STATUSES.has(p)).join(" · ")
    : null;
  const caseInfo = getCaseInfo(task);
  const ago = timeSinceUpdate(task, nowMs);
  const isWaiting = actionOwnerRank(task) === 1;
  const isMinTur = actionOwnerRank(task) === 0;
  const isCloseable = task.closeable === true;
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
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} aria-hidden="true" />
          <span className="text-2xs font-medium text-ink-4">{SOURCE_LABEL[task.source]}</span>
        </div>
        <div className="flex items-start gap-2">
          <p
            className={`flex-1 text-md font-medium leading-snug text-ink-1 ${
              isDone ? "line-through" : ""
            }`}
          >
            {task.title}
          </p>
          {task.cc && (
            <span className="mt-0.5 shrink-0 rounded border border-amber-700/50 bg-amber-950/40 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-amber-400/80">
              Kopi
            </span>
          )}
          {task.attachments && task.attachments.length > 0 && (
            <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Vedlegg">
              <path d="M13 8.5V11a4 4 0 01-8 0V4a2.5 2.5 0 015 0v7a1 1 0 01-2 0V5" />
            </svg>
          )}
        </div>
        {(caseInfo.customer || caseInfo.status || due || task.awaiting || task.closeable || priority === "high") && (
          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate font-medium text-accent">
                {caseInfo.customer ?? ""}
              </span>
              {priority === "high" && (
                <span className="shrink-0 text-2xs font-semibold text-status-danger">Kritisk</span>
              )}
            </div>
            {task.closeable ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/25">
                ✓ Kan lukkes
              </span>
            ) : task.awaiting === "deg!" || task.awaiting === "Morten" || (!task.awaiting && actionOwnerRank(task) === 0) ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium bg-status-action/12 text-status-action">
                ▸ Din tur
              </span>
            ) : task.awaiting ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 bg-surface-2 text-ink-3 ring-line-strong">
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
                  <span className={`shrink-0 tabular-nums ${overdue ? "text-status-danger" : "text-ink-3"}`}>
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

  const needsAction = isCloseable || isMinTur;

  return (
    <li
      id={`task-${task.id}`}
      className={`group rounded-2xl border border-line p-3 shadow-md shadow-black/15 transition ${
        needsAction ? "bg-surface-2 border-line-strong" : "bg-surface-1"
      } ${isDone || dimmed ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleDone(task.id)}
          aria-label={isDone ? "Marker som ikke ferdig" : "Marker som ferdig"}
          aria-pressed={isDone}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
            isDone
              ? "bg-emerald-500 ring-emerald-500"
              : "bg-transparent ring-line-strong hover:ring-line-strong"
          }`}
        >
          {isDone && (
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-surface-0"
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
            className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-xl p-1 text-left active:bg-surface-2"
          >
            <div className="min-w-0 flex-1">{body}</div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
              {ago && (
                <span className="text-xs font-semibold tabular-nums text-ink-2">
                  {ago}
                </span>
              )}
              <svg
                viewBox="0 0 16 16"
                className={`h-4 w-4 text-ink-3 transition-transform ${
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
            className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-xl p-1 active:bg-surface-2"
          >
            <div className="min-w-0 flex-1">{body}</div>
            {ago && (
              <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-ink-2">
                {ago}
              </span>
            )}
          </a>
        )}
      </div>

      {isExpanded && task.source === "outlook" && (() => {
        const shownBody = task.emailBody ?? task.analysis;
        const isLong = (shownBody?.length ?? 0) > 600;
        return (
          <div className="mt-3 ml-9">
            <div className={`mt-2 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
              <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>
                  {task.outlookCategory === "kopi" ? "Kopi" : task.outlookCategory === "til-info" ? "Til info" : "Oppsummering"}
                </span>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm leading-relaxed text-ink-2">
                  {task.summary ?? task.lastMessage?.preview ?? "Ingen beskrivelse tilgjengelig."}
                </p>
                {task.attachments && task.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {task.attachments.map((name) => (
                      <a key={name} href={task.externalUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 rounded border ${accent.divider} bg-surface-2 px-2 py-0.5 text-2xs text-ink-2 transition hover:bg-surface-3`}>
                        <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 8.5V11a4 4 0 01-8 0V4a2.5 2.5 0 015 0v7a1 1 0 01-2 0V5" />
                        </svg>
                        {name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {shownBody && (
              <div className={`mt-4 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
                <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                  <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Siste e-post</span>
                </div>
                <div className="px-3 py-2.5 text-sm leading-relaxed text-ink-2">
                  <p className="whitespace-pre-line">{shownBody}</p>
                  {isLong && (
                    <p className="mt-2 text-xs italic text-ink-3">(Åpne i Outlook for å lese hele e-posten)</p>
                  )}
                </div>
              </div>
            )}
            {task.thread && task.thread.length > 0 && (
              <div className={`mt-4 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
                <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                  <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Historikk</span>
                </div>
                <div className="px-3 pt-3 pb-1">
                  {task.thread.map((msg, i) => {
                    const isLast = i === task.thread!.length - 1;
                    const cleanFrom = msg.from.replace(/\s*\[.*?\]/g, "").trim();
                    const arrowIdx = cleanFrom.indexOf(" → ");
                    let sender: string;
                    let recipient: string;
                    if (arrowIdx !== -1) {
                      sender = cleanFrom.slice(0, arrowIdx);
                      recipient = cleanFrom.slice(arrowIdx + 3);
                    } else {
                      sender = cleanFrom;
                      recipient = "Morten";
                    }
                    return (
                      <div key={i} className="relative pl-5 pb-3">
                        {i < task.thread!.length - 1 && (
                          <span className="absolute left-[7px] top-3 bottom-0 w-px bg-line-strong" />
                        )}
                        {isLast && (
                          <span className="absolute left-0 top-1 h-3.5 w-3.5 animate-ping rounded-full border-2 border-source-outlook opacity-60" />
                        )}
                        <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${
                          isLast ? "border-source-outlook bg-source-outlook/20" : "border-line-strong bg-surface-2"
                        }`} />
                        <div className="text-xs leading-snug">
                          <div className="flex items-baseline gap-1">
                            <span className={`font-semibold ${isLast ? "text-ink-1" : "text-ink-2"}`}>{shortName(sender)}</span>
                            <span className="text-ink-3">→</span>
                            <span className="text-ink-3">{shortName(recipient)}</span>
                            <span className="ml-auto tabular-nums text-ink-3">{msg.date}</span>
                          </div>
                          <p className={`mt-0.5 ${isLast ? "text-ink-2" : "text-ink-3"}`}>{msg.preview}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={task.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 ring-1 ring-line-strong transition hover:bg-surface-3"
                >
                  Åpne i Outlook
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h7v7M13 3l-9 9" />
                  </svg>
                </a>
                <a
                  href={buildOutlookAskClaudeUrl(task)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
                >
                  Spør Claude
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2v-2H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={handleShareClaude}
                  className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium ring-1 transition ${
                    copied
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                      : "bg-surface-2 text-ink-2 ring-line-strong hover:bg-surface-3"
                  }`}
                  aria-live="polite"
                >
                  {copied ? "✓ Kopiert" : "Kopier til Claude"}
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
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-3 ring-1 ring-line-strong"
                >
                  Detaljer
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
              </div>
              <a
                href={buildOutlookAmestoMailto(task)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25"
              >
                Send til Amesto
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4l6 5 6-5M2 4v8h12V4" />
                </svg>
              </a>
              <a
                href={buildOutlookForwardMailto(task)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
              >
                Videresend
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 4l5 4-5 4V9C5 9 3 10 2 13c0-4 2-7 6-7V4z" />
                </svg>
              </a>
            </div>
          </div>
        );
      })()}

      {isExpanded && task.source === "teams" && (() => {
        const shownBody = task.emailBody;
        const isLong = (shownBody?.length ?? 0) > 600;
        const sammenhengLabel =
          task.teamsCategory === "mention" ? "@Nevnt" :
          task.teamsCategory === "group-mention" ? "@Alle" :
          "Sammenheng";
        return (
          <div className="mt-3 ml-9">
            <div className={`mt-2 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
              <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>
                  {sammenhengLabel}
                </span>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm leading-relaxed text-ink-2">
                  {task.summary ?? task.lastMessage?.preview ?? "Ingen beskrivelse tilgjengelig."}
                </p>
              </div>
            </div>

            {shownBody && (
              <div className={`mt-4 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
                <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                  <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Siste melding</span>
                </div>
                <div className="px-3 py-2.5 text-sm leading-relaxed text-ink-2">
                  <p className="whitespace-pre-line">{shownBody}</p>
                  {isLong && (
                    <p className="mt-2 text-xs italic text-ink-3">(Åpne i Teams for å lese hele samtalen)</p>
                  )}
                </div>
              </div>
            )}

            {task.thread && task.thread.length > 0 && (
              <div className={`mt-4 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
                <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                  <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Historikk</span>
                </div>
                <div className="px-3 pt-3 pb-1">
                  {task.thread.map((msg, i) => {
                    const isLast = i === task.thread!.length - 1;
                    const cleanFrom = msg.from.replace(/\s*\[.*?\]/g, "").trim();
                    const arrowIdx = cleanFrom.indexOf(" → ");
                    let sender: string;
                    let recipient: string;
                    if (arrowIdx !== -1) {
                      sender = cleanFrom.slice(0, arrowIdx);
                      recipient = cleanFrom.slice(arrowIdx + 3);
                    } else {
                      sender = cleanFrom;
                      recipient = "Morten";
                    }
                    return (
                      <div key={i} className="relative pl-5 pb-3">
                        {i < task.thread!.length - 1 && (
                          <span className="absolute left-[7px] top-3 bottom-0 w-px bg-line-strong" />
                        )}
                        {isLast && (
                          <span className="absolute left-0 top-1 h-3.5 w-3.5 animate-ping rounded-full border-2 border-source-teams opacity-60" />
                        )}
                        <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${
                          isLast ? "border-source-teams bg-source-teams/20" : "border-line-strong bg-surface-2"
                        }`} />
                        <div className="text-xs leading-snug">
                          <div className="flex items-baseline gap-1">
                            <span className={`font-semibold ${isLast ? "text-ink-1" : "text-ink-2"}`}>{shortName(sender)}</span>
                            <span className="text-ink-3">→</span>
                            <span className="text-ink-3">{shortName(recipient)}</span>
                            <span className="ml-auto tabular-nums text-ink-3">{msg.date}</span>
                          </div>
                          <p className={`mt-0.5 ${isLast ? "text-ink-2" : "text-ink-3"}`}>{msg.preview}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={task.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
                >
                  Åpne i Teams
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h7v7M13 3l-9 9" />
                  </svg>
                </a>
                <a
                  href={buildTeamsAskClaudeUrl(task)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
                >
                  Spør Claude
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2v-2H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={handleShareClaude}
                  className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium ring-1 transition ${
                    copied
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                      : "bg-surface-2 text-ink-2 ring-line-strong hover:bg-surface-3"
                  }`}
                  aria-live="polite"
                >
                  {copied ? "✓ Kopiert" : "Kopier til Claude"}
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
                <div className="inline-flex items-center justify-center rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-4 ring-1 ring-line-strong" />
              </div>
            </div>
          </div>
        );
      })()}

      {isExpanded && task.source === "asana" && (
        <div className={`mt-3 ml-9 border-l-2 ${accent.divider} pl-3`}>
          {asanaArea && (
            <p className={`mb-2 text-2xs font-medium uppercase tracking-wider ${accent.icon}`}>
              {asanaArea}
            </p>
          )}
          <p className="text-sm leading-relaxed text-ink-2">
            {task.summary ?? "Ingen beskrivelse tilgjengelig."}
          </p>
          {due && (
            <p className={`mt-1.5 text-xs ${overdue ? "text-status-danger" : "text-ink-3"}`}>
              Frist: {due}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-source-asana/15 px-3 py-1.5 text-xs font-medium text-source-asana ring-1 ring-source-asana/30 transition hover:bg-source-asana/25"
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
                  : "bg-surface-2 text-ink-2 ring-line-strong hover:bg-surface-3"
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
        <div className="mt-3 ml-9">
          {task.summary && (
            <div className={`mt-2 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
              <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Oppsummering</span>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm leading-relaxed text-ink-2 whitespace-pre-line">{task.summary}</p>
              </div>
            </div>
          )}

          {task.lastMessage && (
            <div className={`mt-4 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
              <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Siste melding</span>
              </div>
              <div className="px-3 py-2.5">
                <p className="mb-1 text-2xs font-semibold text-ink-3">{task.lastMessage.from}</p>
                <p className="text-sm leading-relaxed text-ink-2">{task.lastMessage.preview}</p>
              </div>
            </div>
          )}

          {task.thread && task.thread.length > 0 && (
            <div className={`mt-4 overflow-hidden rounded-lg border ${accent.divider} bg-surface-2`}>
              <div className={`border-b ${accent.divider} ${accent.soft} px-3 py-2`}>
                <span className={`text-xs font-bold uppercase tracking-widest ${accent.icon}`}>Historikk</span>
              </div>
              <div className="px-3 pt-3 pb-1">
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
                        <span className="absolute left-[7px] top-3 bottom-0 w-px bg-line-strong" />
                      )}
                      {isLast && (
                        <span className="absolute left-0 top-1 h-3.5 w-3.5 animate-ping rounded-full border-2 border-accent opacity-60" />
                      )}
                      <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${
                        isLast
                          ? "border-accent bg-accent/20"
                          : msg.resolved
                          ? "border-emerald-500 bg-emerald-500/20"
                          : "border-line-strong bg-surface-2"
                      }`} />
                      <div className="text-xs leading-snug">
                        <div className="flex items-baseline gap-1">
                          <span className={`font-semibold ${isLast ? "text-ink-1" : msg.resolved ? "text-emerald-400" : "text-ink-2"}`}>{shortName(sender)}</span>
                          <span className={msg.resolved ? "text-emerald-700" : "text-ink-3"}>→</span>
                          <span className={msg.resolved ? "text-emerald-600" : "text-ink-3"}>{shortName(recipient)}</span>
                          <span className="ml-auto tabular-nums text-ink-3">{msg.date}</span>
                        </div>
                        <p className={`mt-0.5 ${isLast ? "text-ink-2" : msg.resolved ? "text-emerald-600/80" : "text-ink-3"}`}>{msg.preview}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent/25"
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
                className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium ring-1 transition ${
                  copied
                    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                    : "bg-surface-2 text-ink-2 ring-line-strong hover:bg-surface-3"
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 ring-1 ring-line-strong transition hover:bg-surface-3"
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

function KpiWidget({ title, value, hint, detail }: WidgetSpec) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className={`${CARD_SHELL} p-3.5 text-left transition hover:border-line-strong`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-medium text-ink-4">{title}</p>
        <svg
          viewBox="0 0 16 16"
          className={`mt-0.5 h-3 w-3 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-1">{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">{hint}</p>
      {open && (
        <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-ink-3">
          {detail}
        </p>
      )}
    </button>
  );
}

function usePersistedCollapse(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KPI_COLLAPSED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        if (parsed[key]) setCollapsed(true);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const stored = window.localStorage.getItem(KPI_COLLAPSED_KEY);
      const parsed: Record<string, boolean> = stored ? JSON.parse(stored) : {};
      parsed[key] = collapsed;
      window.localStorage.setItem(KPI_COLLAPSED_KEY, JSON.stringify(parsed));
    } catch {
      /* ignore quota errors */
    }
  }, [collapsed, hydrated, key]);

  return [collapsed, () => setCollapsed((v) => !v)];
}

function CardHeader({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
}: {
  title: string;
  subtitle?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
      <div className="flex shrink-0 items-baseline gap-2">
        {subtitle && <span className="text-xs text-ink-3">{subtitle}</span>}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? `Vis ${title}` : `Skjul ${title}`}
            aria-expanded={!collapsed}
            className="text-ink-3 hover:text-ink-1"
          >
            <svg
              viewBox="0 0 16 16"
              className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
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
    </div>
  );
}

function useCalendarNotes(): [Record<string, string[]>, (id: string, value: string) => void, (id: string, index: number) => void] {
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CALENDAR_NOTES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string | string[]>;
        const normalized: Record<string, string[]> = {};
        for (const [id, value] of Object.entries(parsed)) {
          normalized[id] = Array.isArray(value) ? value : [value];
        }
        setNotes(normalized);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CALENDAR_NOTES_KEY, JSON.stringify(notes));
    } catch {
      /* ignore quota errors */
    }
  }, [notes, hydrated]);

  function addNote(id: string, value: string) {
    if (!value.trim()) return;
    setNotes((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), value] }));
  }

  function removeNote(id: string, index: number) {
    setNotes((prev) => ({ ...prev, [id]: (prev[id] ?? []).filter((_, i) => i !== index) }));
  }

  return [notes, addNote, removeNote];
}

function calendarDateBadge(dato: string, today: string): string {
  const diffDays = Math.round((Date.parse(dato) - Date.parse(today)) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "bg-status-positive/12 text-status-positive";
  if (diffDays > 0 && diffDays <= 7) return "bg-status-warning/12 text-status-warning";
  return "bg-surface-2 text-ink-3";
}

function CalendarCard({ today }: { today: string }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Kalender");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, addNote, removeNote] = useCalendarNotes();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const visible = showAll ? CALENDAR_EVENTS : CALENDAR_EVENTS.slice(0, 6);
  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Kalender"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{CALENDAR_EVENTS.length}</span> kommende</>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        CALENDAR_EVENTS.length === 0 ? (
          <p className="text-sm text-ink-3">Ingen møter i perioden.</p>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-ink-4">
                    <th className="px-3 py-2 text-2xs font-medium">Dato</th>
                    <th className="px-3 py-2 text-2xs font-medium text-right">Start</th>
                    <th className="px-3 py-2 text-2xs font-medium text-right">Slutt</th>
                    <th className="px-3 py-2 text-2xs font-medium">Møte</th>
                    <th className="px-3 py-2 text-2xs font-medium">Beskrivelse</th>
                    <th className="px-3 py-2 text-2xs font-medium">Sted</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => {
                    const isOpen = selected === m.id;
                    return (
                      <Fragment key={m.id}>
                        <tr
                          onClick={() => setSelected(isOpen ? null : m.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(isOpen ? null : m.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 tabular-nums text-2xs font-medium ${calendarDateBadge(m.dato, today)}`}>
                              {formatDateDMY(m.dato)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{m.start}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{m.slutt}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-ink-1">{m.mote}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-ink-2">{m.beskrivelse}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-ink-2">{m.sted}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-line bg-surface-2">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-2xs font-medium text-ink-4">Info fra Outlook</p>
                                  <p className="whitespace-pre-line text-xs leading-relaxed text-ink-2">
                                    {m.merknad ?? "Ingen tilleggsinfo hentet fra Outlook."}
                                  </p>
                                </div>
                                <div>
                                  <p className="mb-1 text-2xs font-medium text-ink-4">Mine notater</p>
                                  <textarea
                                    value={drafts[m.id] ?? ""}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="Skriv et nytt notat om møtet …"
                                    rows={2}
                                    className="w-full resize-none rounded-lg border border-line bg-surface-1 p-2 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addNote(m.id, drafts[m.id] ?? "");
                                      setDrafts((prev) => ({ ...prev, [m.id]: "" }));
                                    }}
                                    className="mt-1.5 rounded-md bg-surface-3 px-2.5 py-1 text-2xs font-medium text-ink-2 hover:text-ink-1"
                                  >
                                    Lagre
                                  </button>
                                  {(notes[m.id]?.length ?? 0) > 0 && (
                                    <ul className="mt-2 space-y-1.5">
                                      {notes[m.id].map((note, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start justify-between gap-2 whitespace-pre-line rounded-lg bg-surface-1 p-2 text-xs leading-relaxed text-ink-2"
                                        >
                                          <span>{note}</span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeNote(m.id, i);
                                            }}
                                            className="shrink-0 text-ink-4 hover:text-rose-400"
                                            aria-label="Slett notat"
                                          >
                                            ×
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {CALENDAR_EVENTS.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 text-xs font-medium text-accent hover:text-accent/80"
              >
                {showAll ? "Vis færre" : `Mer (${CALENDAR_EVENTS.length - 6})`}
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}

function ContractsCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Nye kontrakter");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? CONTRACTS : CONTRACTS.slice(0, 5);
  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Nye kontrakter"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{CONTRACTS.length}</span> signert siste 30 dager</>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-3 py-2 text-2xs font-medium">Kunde</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Signeringsdato</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Startdato</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Årsbeløp</th>
                  <th className="px-3 py-2 text-2xs font-medium">Bygg</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Kvm</th>
                  <th className="px-3 py-2 text-2xs font-medium">Leietype</th>
                  <th className="px-3 py-2 text-2xs font-medium">Kontrakt</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.kunde} className="border-t border-line transition-colors hover:bg-surface-2/50">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.kunde}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.signeringsdato)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.startdato)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatKr(c.arsbelop)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.bygg}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{c.kvm}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.leietype}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {c.sfUrl ? (
                        <a
                          href={c.sfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          Åpne i SF
                        </a>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {CONTRACTS.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs font-medium text-accent hover:text-accent/80"
            >
              {showAll ? "Vis færre" : `Mer (${CONTRACTS.length - 5})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function GuaranteesCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Garantioversikt");
  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Garantioversikt"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{GUARANTEE_TOTAL}</span> mangler garanti/depositum</>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2 text-2xs font-medium">Status</th>
                <th className="px-3 py-2 text-2xs font-medium">Leietaker</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Beløp</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Frist</th>
              </tr>
            </thead>
            <tbody>
              {GUARANTEES.map((g) => (
                <tr key={g.leietaker} className="border-t border-line transition-colors hover:bg-surface-2/50">
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium ${GUARANTEE_STATUS_STYLE[g.status]}`}>
                      {g.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{g.leietaker}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{g.belop === null ? "—" : formatKr(g.belop)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{formatDateDMY(g.frist)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WeeklyTrendChart({ data }: { data: number[] }) {
  const [active, setActive] = useState(data.length - 1);
  const width = 300;
  const height = 84;
  const gap = 4;
  const barW = (width - gap * (data.length - 1)) / data.length;
  const max = Math.max(...data);
  const min = Math.min(...data) * 0.9;
  const scale = (v: number) => ((v - min) / (max - min)) * (height - 4);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Kundefordringer per uke, siste 12 uker">
        <line x1={0} y1={height} x2={width} y2={height} className="stroke-line" strokeWidth={1} />
        {data.map((v, i) => {
          const h = scale(v);
          const x = i * (barW + gap);
          const isActive = i === active;
          return (
            <g
              key={i}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(i);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Uke ${i + 1}: ${formatKr(v)}`}
            >
              <rect x={x} y={0} width={barW} height={height} fill="transparent" />
              <rect
                x={x}
                y={height - h}
                width={barW}
                height={h}
                rx={2}
                className="fill-accent"
                opacity={isActive ? 1 : 0.45}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-3">12 uker siden</span>
        <span className="font-medium tabular-nums text-ink-1">
          Uke {active + 1}: {formatKr(data[active])}
        </span>
        <span className="text-ink-3">Denne uken</span>
      </div>
    </div>
  );
}

function ReceivablesCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Kundefordringer");
  const [showTrend, setShowTrend] = useState(false);
  const total = RECEIVABLES.reduce((sum, r) => sum + r.utestaende, 0);
  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Kundefordringer"
        subtitle={<span className="font-medium tabular-nums text-ink-2">{formatKr(total)}</span>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-3 py-2 text-2xs font-medium">Leietaker</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Utestående</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Utestående 60+ dager</th>
                  <th className="px-3 py-2 text-2xs font-medium text-right">Dager siden betaling</th>
                </tr>
              </thead>
              <tbody>
                {RECEIVABLES.map((r) => (
                  <tr key={r.leietaker} className="border-t border-line transition-colors hover:bg-surface-2/50">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{r.leietaker}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatKr(r.utestaende)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 tabular-nums text-right ${r.utestaende60 > 0 ? "text-status-danger" : "text-ink-3"}`}>
                      {formatKr(r.utestaende60)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{r.dagerSidenBetaling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setShowTrend((v) => !v)}
            className="mt-3 text-xs font-medium text-accent hover:text-accent/80"
          >
            {showTrend ? "Skjul utvikling" : "Vis utvikling siste 3 mnd"}
          </button>
          {showTrend && (
            <div className="mt-3 border-t border-line pt-3">
              <WeeklyTrendChart data={RECEIVABLES_TREND} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ForecastCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose");
  const totalLeieinntekt = BUILDINGS.reduce((s, b) => s + b.leieinntekt2026, 0);
  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Leieinntekt 2026 — topp 5 bygg"
        subtitle={<span className="font-medium tabular-nums text-ink-2">{formatKr(totalLeieinntekt)}</span>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2 text-2xs font-medium">Bygg</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Leieinntekt 2026</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Kontraktslinjer</th>
              </tr>
            </thead>
            <tbody>
              {BUILDINGS.map((b) => (
                <tr key={b.navn} className="border-t border-line transition-colors hover:bg-surface-2/50">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{b.navn}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatKr(b.leieinntekt2026)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{b.antallLinjer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Jobb eller privat"
      className="inline-flex shrink-0 rounded-full border border-line-strong bg-surface-2 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "jobb"}
        onClick={() => onChange("jobb")}
        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
          mode === "jobb"
            ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/40"
            : "text-ink-3 hover:text-ink-1"
        }`}
      >
        Jobb
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "privat"}
        onClick={() => onChange("privat")}
        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
          mode === "privat"
            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
            : "text-ink-3 hover:text-ink-1"
        }`}
      >
        Privat
      </button>
    </div>
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
  const [mode, setMode] = useState<Mode>("jobb");
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
    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (stored === "jobb" || stored === "privat") setMode(stored);
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore quota errors */
    }
  }, [mode, hydrated]);

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
    // I "alle"-fanen: Teams øverst, så Salesforce, så Outlook
    if (filter === "all") {
      const sourceOrder: Partial<Record<Source, number>> = { teams: 0, salesforce: 1, outlook: 2 };
      const as = sourceOrder[a.source] ?? 3;
      const bs = sourceOrder[b.source] ?? 3;
      if (as !== bs) return as - bs;
    }
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
    <>
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:pt-10 md:max-w-5xl md:px-8">
      <header className="mb-7">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1">
            I dag
          </h1>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        {mode === "jobb" && (
          <>
            <div className="mt-3 flex justify-end">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="search"
                  placeholder="Søk..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-32 rounded-full border border-line bg-surface-2 py-1.5 pl-8 pr-3 text-sm text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong focus:w-44 transition-all duration-200"
                />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
              <span>
                {counts.all} {counts.all === 1 ? "oppgave igjen" : "oppgaver igjen"}
              </span>
              {priorityCounts.high > 0 && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="h-2 w-2 rounded-full bg-status-danger" />
                  {priorityCounts.high}
                </span>
              )}
              {priorityCounts.medium > 0 && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="h-2 w-2 rounded-full bg-status-warning" />
                  {priorityCounts.medium}
                </span>
              )}
              {priorityCounts.low > 0 && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="h-2 w-2 rounded-full bg-status-positive" />
                  {priorityCounts.low}
                </span>
              )}
            </div>
          </>
        )}
      </header>

      <p className="mb-2 text-2xs uppercase tracking-wider text-ink-3">
        Nøkkeltall · Ekte data: kontrakter, leieinntekt, kalender, garantier og kundefordringer · Testdata: ukesgraf
      </p>
      {mode === "jobb" ? (
        <div className="mb-6 flex flex-col gap-3">
          <CalendarCard today={today} />
          <ContractsCard />
          <GuaranteesCard />
          <ReceivablesCard />
          <ForecastCard />
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {PRIVAT_WIDGETS.map((w) => (
              <KpiWidget key={w.title} {...w} />
            ))}
          </div>
          <PrivatPanel />
        </div>
      )}

      {mode === "jobb" && (
      <>
      <p className="mb-2 text-2xs uppercase tracking-wider text-ink-3">Oppgaver</p>
      <div
        className="-mx-4 mb-0 flex gap-2 overflow-x-auto px-4 pb-0 leading-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Kilder"
      >
        {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => {
          const active = filter === f;
          const label = f === "all" ? "Alle" : SOURCE_META[f].label;
          const accent = f !== "all" ? SOURCE_ACCENT[f] : null;
          const tabClass = accent
            ? active
              ? `rounded-full border border-transparent ${accent.soft} ${accent.softText} ring-1 ${accent.softRing}`
              : "rounded-full border border-line bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-ink-1"
            : active
              ? "rounded-full border border-line-strong bg-surface-3 text-ink-1"
              : "rounded-full border border-line bg-surface-1 text-ink-3 hover:text-ink-1";
          const badgeClass = accent
            ? active ? accent.softText : "text-ink-3"
            : active ? "text-ink-2" : "text-ink-3";
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={`flex shrink-0 items-center gap-2 px-4 py-2 text-sm font-medium transition ${tabClass}`}
            >
              {f !== "all" && (
                <SourceIcon source={f} className={`h-3.5 w-3.5 shrink-0 ${accent!.icon}`} />
              )}
              <span>{label}</span>
              <span className={`text-xs tabular-nums ${badgeClass}`}>
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      <div className={SECTION_SHELL}>
      {showSfTabs && (
        <div
          className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line"
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
                    ? `${SOURCE_ACCENT.salesforce.soft} ${SOURCE_ACCENT.salesforce.softText} ring-1 ${SOURCE_ACCENT.salesforce.softRing}`
                    : "text-ink-3 hover:text-ink-1"
                }`}
              >
                <span>{SF_BUCKET_LABEL[bucket]}</span>
                <span
                  className={`tabular-nums ${
                    active ? SOURCE_ACCENT.salesforce.softText : "text-ink-3"
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
          className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line"
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
                    ? `${SOURCE_ACCENT.outlook.soft} ${SOURCE_ACCENT.outlook.softText} ring-1 ${SOURCE_ACCENT.outlook.softRing}`
                    : "text-ink-3 hover:text-ink-1"
                }`}
              >
                <span>{OUTLOOK_BUCKET_LABEL[bucket]}</span>
                <span className={`tabular-nums ${active ? SOURCE_ACCENT.outlook.softText : "text-ink-3"}`}>
                  {outlookBucketCounts[bucket]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-3">
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
              onToggleDone={toggleDone}
              onToggleExpanded={toggleExpanded}
              onToggleDetails={toggleDetails}
              onJumpToCase={jumpToCase}
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
                    className="mb-2 flex w-full items-center gap-2 px-1 text-xs font-semibold text-status-action hover:text-status-action/80"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-status-action" />
                    Min tur
                    <span className="text-status-action/70">({minTur.length})</span>
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
                    className="mb-2 flex w-full items-center gap-2 px-1 text-xs font-semibold text-ink-3 hover:text-ink-1"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                    Avventer
                    <span className="text-ink-4">({venter.length})</span>
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
                    className="mb-2 flex w-full items-center gap-2 px-1 text-xs font-semibold text-ink-3 hover:text-ink-1"
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
      </>
      )}
    </div>
    <ChatWidget />
    </>
  );
}
