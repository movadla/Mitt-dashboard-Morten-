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
  CALENDAR_EVENTS,
  CONTRACTS,
  type Contract,
  EXPIRIES,
  EXPIRIES_REELL_EKSPONERING,
  EXPIRIES_TOTAL_ARSLEIE,
  EXPIRIES_WINDOW,
  type ExpiringTenant,
  type ExpiryStatus,
  GUARANTEES,
  GUARANTEE_TOTAL,
  type Guarantee,
  type GuaranteeStatus,
  RECEIVABLES,
  type Receivable,
  type ReceivableInvoice,
  formatDateDMY,
  formatKr,
} from "@/lib/widgets";
import type { Comment } from "@/lib/comments";
import type { ReceivableRiskLevel } from "@/lib/receivableRisk";
import { computeAging, computeAutoRisk } from "@/lib/receivablesAging";
import { getMainBuilding } from "@/lib/receivableBuilding";
import type { ReceivableSnapshot } from "@/lib/receivablesSnapshots";
import { CalendarClock, CalendarDays, ChevronDown, ChevronUp, FileSignature, Receipt, ShieldCheck, X } from "lucide-react";
import { CARD_SHELL, CardErrorBoundary, CardHeader, CollapsibleBody, ConfirmDialog, MutationError, useConfirmDelete, useMutationError, usePersistedCollapse, usePersistedOrder, SortableSection } from "./CardShell";
import { relativeDayLabel } from "@/lib/payday";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CommentBadge, CommentThreadBody } from "./CommentsCell";
import { commentKey, useComments } from "./useComments";
import IncomeForecastSection from "./IncomeForecastSection";
import JobbTodaySummary from "./JobbTodaySummary";
import JobbRemindersSection from "./JobbRemindersSection";
import JobbEventsSection from "./JobbEventsSection";
import JobbLeasingManagersCard from "./JobbLeasingManagersCard";
import JobbTenantDirectoryCard from "./JobbTenantDirectoryCard";
import JobbProcedureNotesCard from "./JobbProcedureNotesCard";

type Filter = Source | "all";
type SfBucket = "alle" | "faktura" | "kreditnota" | "garanti" | "annet";
type OutlookBucket = OutlookCategory;

const SECTION_SHELL = "border-t border-line pt-3 mt-3";

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

const EXPIRY_STATUS_STYLE: Record<ExpiryStatus, string> = {
  Reforhandlet: "bg-status-positive/12 text-status-positive",
  Terminert: "bg-status-danger/12 text-status-danger",
  "Mulig endring": "bg-status-warning/12 text-status-warning",
  "Reforhandling pågår": "bg-accent/15 text-accent",
  "Ingen varsel": "text-ink-4",
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
            title="Hold inne for å utsette"
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
              <div className="flex flex-wrap gap-2">
                <a
                  href={task.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 ring-1 ring-line-strong transition hover:bg-surface-3"
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
                  className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
                >
                  Spør Claude
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2v-2H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={handleShareClaude}
                  className={`inline-flex flex-1 min-w-[45%] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium ring-1 transition ${
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
              <div className="flex flex-wrap gap-2">
                <a
                  href={task.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
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
                  className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
                >
                  Spør Claude
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2v-2H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={handleShareClaude}
                  className={`inline-flex flex-1 min-w-[45%] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium ring-1 transition ${
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
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-source-asana/15 px-3 py-1.5 text-xs font-medium text-source-asana ring-1 ring-source-asana/30 transition hover:bg-source-asana/25"
            >
              Åpne i Asana
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h7v7M13 3l-9 9" />
              </svg>
            </a>
            <button
              type="button"
              onClick={handleShareClaude}
              className={`inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
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
            <div className="flex flex-wrap gap-2">
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent/25"
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
                className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25"
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
                className={`inline-flex flex-1 min-w-[45%] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium ring-1 transition ${
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
                  className="inline-flex flex-1 min-w-[45%] items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 ring-1 ring-line-strong transition hover:bg-surface-3"
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
        // localStorage kan ikke leses under SSR/første render uten hydrerings-
        // avvik — dette MÅ skje i en effekt, ikke avledes i render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Kalender", true);
  const [visibleCount, setVisibleCount] = useState(6);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, addNote, removeNote] = useCalendarNotes();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const confirmDeleteNote = useConfirmDelete<{ meetingId: string; index: number; preview: string }>();
  const visible = CALENDAR_EVENTS.slice(0, visibleCount);
  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-indigo-400/60 p-4`}>
      <CardHeader
        title="Kalender"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{CALENDAR_EVENTS.length}</span> kommende</>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={CalendarDays}
        iconColorClass="text-indigo-400"
      />
      <CollapsibleBody collapsed={collapsed}>
        {CALENDAR_EVENTS.length === 0 ? (
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
                  {visible.map((m, i) => {
                    const isOpen = selected === m.id;
                    const prevDate = i > 0 ? visible[i - 1].dato : null;
                    const showHeader = m.dato !== prevDate;
                    return (
                      <Fragment key={m.id}>
                        {showHeader && (
                          <tr className="border-t border-line">
                            <td colSpan={6} className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-ink-4">
                              {relativeDayLabel(m.dato, today)}
                            </td>
                          </tr>
                        )}
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
                          className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50"
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
                                    className="w-full resize-none rounded-lg border border-transparent bg-surface-1 p-2 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
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
                                              confirmDeleteNote.request({ meetingId: m.id, index: i, preview: note });
                                            }}
                                            className="shrink-0 text-ink-4 hover:text-rose-400"
                                            aria-label="Slett notat"
                                          >
                                            <X className="h-3.5 w-3.5" />
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
            {CALENDAR_EVENTS.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 10)}
                className="mt-3 text-xs font-medium text-ink-3 hover:text-ink-1"
              >
                {`Mer (${CALENDAR_EVENTS.length - visibleCount})`}
              </button>
            )}
          </>
        )}
      </CollapsibleBody>
      <ConfirmDialog
        open={confirmDeleteNote.isOpen}
        message={confirmDeleteNote.pending ? `Slette notatet «${confirmDeleteNote.pending.preview}»?` : ""}
        onCancel={confirmDeleteNote.cancel}
        onConfirm={() => {
          const pending = confirmDeleteNote.pending;
          if (pending) removeNote(pending.meetingId, pending.index);
          confirmDeleteNote.cancel();
        }}
      />
    </div>
  );
}

function ContractRow({
  contract: c,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
}: {
  contract: Contract;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="whitespace-nowrap px-2 py-2 text-ink-2">{c.kunde}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.signeringsdato)}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.startdato)}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-right text-ink-2">{formatKr(c.arsbelop)}</td>
        <td className="whitespace-nowrap px-2 py-2 text-ink-2">{c.bygg}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-right text-ink-2">{c.kvm}</td>
        <td className="whitespace-nowrap px-2 py-2 text-ink-2">{c.leietype}</td>
        <td className="whitespace-nowrap px-2 py-2">
          {c.sfUrl ? (
            <a
              href={c.sfUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Åpne ${c.kunde} i Salesforce`}
              className="text-accent hover:underline"
            >
              Link
            </a>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={9} className="px-2 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

// Cutoff for "siden årsstart": de tre første månedene av et nytt år faller tilbake til
// forrige årsstart i stedet (unngår en nesten tom "siden 2027"-visning i januar-mars —
// utvider først til inneværende års 1. januar fra og med april).
function yearStartCutoff(todayISO: string): string {
  const [yearStr, monthStr] = todayISO.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const effectiveYear = month <= 3 ? year - 1 : year;
  return `${effectiveYear}-01-01`;
}

function oneMonthBack(todayISO: string): string {
  const d = new Date(todayISO);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function ContractsCard({ today }: { today: string }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Nye kontrakter", true);
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const lastMonthCutoff = oneMonthBack(today);
  const yearCutoff = yearStartCutoff(today);
  const sinceLastMonth = useMemo(() => CONTRACTS.filter((c) => c.signeringsdato >= lastMonthCutoff), [lastMonthCutoff]);
  const sinceYearStart = useMemo(() => CONTRACTS.filter((c) => c.signeringsdato >= yearCutoff), [yearCutoff]);
  const visible = expanded ? sinceYearStart : sinceLastMonth;
  const visibleRows = expanded ? visible.slice(0, visibleCount) : visible;
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  const mutationError = useMutationError();

  async function handleAdd(id: string, tekst: string): Promise<boolean> {
    const ok = await addComment("contract", id, tekst);
    if (!ok) mutationError.show("Kunne ikke legge til kommentaren. Prøv igjen.");
    return ok;
  }

  async function handleToggleRelevance(id: string, commentId: string, ikkeRelevant: boolean) {
    const ok = await toggleRelevance("contract", id, commentId, ikkeRelevant);
    if (!ok) mutationError.show("Kunne ikke oppdatere kommentaren. Prøv igjen.");
  }

  async function handleConfirmDelete() {
    const pending = confirmDelete.pending;
    if (!pending) return;
    const ok = await removeComment(pending.targetType, pending.targetId, pending.commentId);
    if (!ok) mutationError.show("Kunne ikke slette kommentaren. Prøv igjen.");
    confirmDelete.cancel();
  }

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-rose-400/60 p-4`}>
      <CardHeader
        title="Nye kontrakter"
        subtitle={
          <>
            <span className="font-medium tabular-nums text-ink-2">{visible.length}</span>{" "}
            {expanded ? `signert siden ${yearCutoff.slice(0, 4)}` : "signert siste måned"}
          </>
        }
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={FileSignature}
        iconColorClass="text-rose-400"
      />
      <CollapsibleBody collapsed={collapsed}>
        <MutationError message={mutationError.message} />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-2 py-2 text-2xs font-medium">Kunde</th>
                <th className="px-2 py-2 text-2xs font-medium text-right">Signert</th>
                <th className="px-2 py-2 text-2xs font-medium text-right">Start</th>
                <th className="px-2 py-2 text-2xs font-medium text-right">Beløp</th>
                <th className="px-2 py-2 text-2xs font-medium">Bygg</th>
                <th className="px-2 py-2 text-2xs font-medium text-right">Kvm</th>
                <th className="px-2 py-2 text-2xs font-medium">Type</th>
                <th className="px-2 py-2 text-2xs font-medium">Kontrakt</th>
                <th className="px-2 py-2 text-2xs font-medium">Notat</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((c) => (
                <ContractRow
                  key={c.id}
                  contract={c}
                  comments={comments[commentKey("contract", c.id)] ?? []}
                  onAdd={(tekst) => handleAdd(c.id, tekst)}
                  onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "contract", targetId: c.id, commentId, preview })}
                  onToggleRelevance={(commentId, ikkeRelevant) => handleToggleRelevance(c.id, commentId, ikkeRelevant)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {expanded && visible.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + 10)}
            className="mt-3 text-xs font-medium text-ink-3 hover:text-ink-1"
          >
            {`Mer (${visible.length - visibleCount})`}
          </button>
        )}
        {sinceYearStart.length > sinceLastMonth.length && (
          <button
            type="button"
            onClick={() => {
              setExpanded((v) => !v);
              setVisibleCount(10);
            }}
            aria-expanded={expanded}
            className="mt-3 block text-xs font-medium text-accent hover:text-accent/80"
          >
            {expanded ? "Vis kun siste måned" : `Vis alle siden ${yearCutoff.slice(0, 4)} (${sinceYearStart.length - sinceLastMonth.length} flere)`}
          </button>
        )}
      </CollapsibleBody>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function ExpiryTenantRow({
  tenant,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
}: {
  tenant: ExpiringTenant;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const nearestLine = tenant.lines.reduce((a, b) => (a.dagerTilUtlop <= b.dagerTilUtlop ? a : b));
  const utlopUrgent = nearestLine.dagerTilUtlop < 10;

  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="p-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full min-w-0 items-center gap-2 px-2 py-2 text-left"
          >
            <svg
              viewBox="0 0 16 16"
              className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
            <span className="truncate text-ink-2">{tenant.leietaker}</span>
          </button>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-2xs text-ink-4">{tenant.bygg}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-ink-3">{tenant.lines.length}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums font-medium text-ink-1">{formatKr(tenant.totalArsleie)}</td>
        <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${utlopUrgent ? "font-medium text-status-danger" : "text-ink-3"}`}>
          {formatDateDMY(nearestLine.slutt)}
        </td>
        <td className="whitespace-nowrap px-2 py-2">
          <span
            title={tenant.statusKilde}
            className={`inline-flex items-center rounded-full px-2 py-1 text-2xs font-medium ${EXPIRY_STATUS_STYLE[tenant.status]}`}
          >
            {tenant.status}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-2 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
      {open &&
        tenant.lines.map((l) => (
          <tr key={l.linjeId} className="border-t border-line border-l-2 border-l-line-strong bg-surface-3/50">
            <td colSpan={7} className="px-2 py-2 pl-8">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="min-w-0 truncate text-ink-2">
                  {l.beskrivelse}
                  {l.bygg !== "(ukjent bygg)" && l.bygg !== tenant.bygg && (
                    <span className="ml-1.5 text-2xs text-ink-4">· {l.bygg}</span>
                  )}
                </span>
                <span className="whitespace-nowrap text-2xs text-ink-4">{l.arealtype}</span>
                <span className="whitespace-nowrap text-2xs text-ink-4">{l.leietype}</span>
                <span className="whitespace-nowrap tabular-nums font-medium text-ink-2">{formatKr(l.totalArsleie)}</span>
                <span
                  className={`whitespace-nowrap tabular-nums text-2xs ${l.dagerTilUtlop < 10 ? "font-medium text-status-danger" : "text-ink-4"}`}
                >
                  {formatDateDMY(l.slutt)}
                </span>
              </div>
              {l.reforhandlet && l.nyKontraktsnokkel && (
                <p className="mt-1 text-2xs text-status-positive">
                  → Reforhandlet: {l.nyKontraktsnokkel}, ny start {formatDateDMY(l.nyKontraktStart!)}
                  {l.gapDager !== undefined && l.gapDager > 0 ? ` (${l.gapDager}d opphold)` : ""}
                </p>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

function ExpiryListCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Utløpsliste", true);
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-orange-400/60 p-4`}>
      <CardHeader
        title="Utløpsliste"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{EXPIRIES.length}</span> leietakere, neste 30 dager</>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={CalendarClock}
        iconColorClass="text-orange-400"
      />
      {!collapsed && (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-2 py-2 text-2xs font-medium">Leietaker</th>
                  <th className="px-2 py-2 text-2xs font-medium">Bygg</th>
                  <th className="px-2 py-2 text-2xs font-medium">Lin.</th>
                  <th className="px-2 py-2 text-2xs font-medium">Årsleie</th>
                  <th className="px-2 py-2 text-2xs font-medium">Utløp</th>
                  <th className="px-2 py-2 text-2xs font-medium">Status</th>
                  <th className="px-2 py-2 text-2xs font-medium">Notat</th>
                </tr>
              </thead>
              <tbody>
                {EXPIRIES.map((t) => {
                  const targetId = String(t.customerId);
                  return (
                    <ExpiryTenantRow
                      key={t.customerId}
                      tenant={t}
                      comments={comments[commentKey("expiry-tenant", targetId)] ?? []}
                      onAdd={(tekst) => addComment("expiry-tenant", targetId, tekst)}
                      onRequestDelete={(commentId, preview) =>
                        confirmDelete.request({ targetType: "expiry-tenant", targetId, commentId, preview })
                      }
                      onToggleRelevance={(commentId, ikkeRelevant) => toggleRelevance("expiry-tenant", targetId, commentId, ikkeRelevant)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-2xs text-ink-4">
            {formatDateDMY(EXPIRIES_WINDOW.fraDato)}–{formatDateDMY(EXPIRIES_WINDOW.tilDato)} · Total eksponering{" "}
            {formatKr(EXPIRIES_TOTAL_ARSLEIE)} · Reell eksponering (ekskl. reforhandlet) {formatKr(EXPIRIES_REELL_EKSPONERING)}
          </p>
        </>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          removeComment(pending.targetType, pending.targetId, pending.commentId);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}

function GuaranteeRow({
  guarantee: g,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
}: {
  guarantee: Guarantee;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="whitespace-nowrap px-3 py-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium ${GUARANTEE_STATUS_STYLE[g.status]}`}>
            {g.status}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">{g.leietaker}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{g.belop === null ? "—" : formatKr(g.belop)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{formatDateDMY(g.frist)}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={5} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

function GuaranteesCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Garantioversikt", true);
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-teal-400/60 p-4`}>
      <CardHeader
        title="Garantioversikt"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{GUARANTEE_TOTAL}</span> mangler garanti/depositum</>}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={ShieldCheck}
        iconColorClass="text-teal-400"
      />
      {!collapsed && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2 text-2xs font-medium">Status</th>
                <th className="px-3 py-2 text-2xs font-medium">Leietaker</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Beløp</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Frist</th>
                <th className="px-3 py-2 text-2xs font-medium">Notat</th>
              </tr>
            </thead>
            <tbody>
              {GUARANTEES.map((g) => (
                <GuaranteeRow
                  key={g.id}
                  guarantee={g}
                  comments={comments[commentKey("guarantee", g.id)] ?? []}
                  onAdd={(tekst) => addComment("guarantee", g.id, tekst)}
                  onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "guarantee", targetId: g.id, commentId, preview })}
                  onToggleRelevance={(commentId, ikkeRelevant) => toggleRelevance("guarantee", g.id, commentId, ikkeRelevant)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          removeComment(pending.targetType, pending.targetId, pending.commentId);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}

const RISK_META: Record<ReceivableRiskLevel, { label: string; textClass: string }> = {
  lav: { label: "Lav", textClass: "text-status-positive" },
  medium: { label: "Medium", textClass: "text-status-warning" },
  hoy: { label: "Høy", textClass: "text-status-danger" },
};

function ReceivableInvoiceRow({ invoice: f }: { invoice: ReceivableInvoice }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-0.5 text-2xs">
      <span className="min-w-0 truncate text-ink-3">
        {f.fakturaNr ? `Fakt. ${f.fakturaNr}` : "Direkte postering"}
        {f.underInkasso ? " · inkasso" : ""}
      </span>
      <span className="tabular-nums text-ink-2">{formatKr(f.belop)}</span>
      <span className="w-16 shrink-0 text-right tabular-nums text-ink-4">{formatDateDMY(f.forfallsdato)}</span>
    </div>
  );
}

function ReceivableRow({
  receivable: r,
  today,
  comments,
  risk,
  onSetRisk,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
}: {
  receivable: Receivable;
  today: string;
  comments: Comment[];
  risk: ReceivableRiskLevel | null;
  onSetRisk: (risk: ReceivableRiskLevel) => void;
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const multiCompany = r.selskaper.length > 1;
  const underInkasso = r.selskaper.some((s) => s.underInkasso);
  const aging = computeAging(r, today);
  const band6190 = aging.d61_90;
  const overdue91 = aging.d91Plus;
  const isOverride = risk !== null;
  const effectiveRisk = risk ?? computeAutoRisk(r, today);
  const bygg = getMainBuilding(r.leietaker);
  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="max-w-0 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center gap-1.5 text-left text-ink-2 hover:text-ink-1"
          >
            {underInkasso && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" title="Under inkasso" />}
            <span className="min-w-0 truncate">{r.leietaker}</span>
          </button>
        </td>
        <td className="max-w-0 truncate px-2 py-1.5 text-2xs text-ink-3">
          {multiCompany ? `${r.selskaper.length} selskaper` : r.selskaper[0]?.selskap ?? "—"}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-right text-ink-2">{formatKr(r.utestaende)}</td>
        <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums text-right ${band6190 > 0 ? "text-status-warning" : "text-ink-4"}`}>
          {band6190 > 0 ? formatKr(band6190) : "–"}
        </td>
        <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums text-right ${overdue91 > 0 ? "text-status-danger" : "text-ink-4"}`}>
          {overdue91 > 0 ? formatKr(overdue91) : "–"}
        </td>
        <td className="whitespace-nowrap px-1 py-1.5">
          <select
            value={effectiveRisk}
            onChange={(e) => onSetRisk(e.target.value as ReceivableRiskLevel)}
            title={isOverride ? "Manuelt satt" : "Automatisk satt basert på forfalt beløp"}
            className={`w-full max-w-full rounded-lg border bg-surface-2 px-1.5 py-1 text-2xs outline-none focus:border-line-strong ${RISK_META[effectiveRisk].textClass} ${isOverride ? "border-line" : "border-dashed border-line"}`}
          >
            <option value="lav">Lav{effectiveRisk === "lav" && !isOverride ? " (auto)" : ""}</option>
            <option value="medium">Medium{effectiveRisk === "medium" && !isOverride ? " (auto)" : ""}</option>
            <option value="hoy">Høy{effectiveRisk === "hoy" && !isOverride ? " (auto)" : ""}</option>
          </select>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {detailsOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-3 py-2 pl-9">
            <div className="mb-1.5 text-2xs text-ink-4">Bygg: {bygg}</div>
            <div className="flex flex-col gap-2.5">
              {r.selskaper.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-ink-2">
                      {s.selskap}
                      {s.underInkasso && (
                        <span className="ml-1.5 rounded-full bg-status-danger/12 px-1.5 py-0.5 text-2xs font-medium text-status-danger">
                          Inkasso
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-2">{formatKr(s.belop)}</span>
                  </div>
                  <div className="mt-1 border-l border-line pl-2">
                    {s.fakturaer.map((f, j) => (
                      <ReceivableInvoiceRow key={j} invoice={f} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

interface ReceivablesHistoryPoint {
  dato: string;
  total: number;
  forfalt: number;
  forfalt91: number;
}

const RECEIVABLES_HISTORY_SERIES = [
  { key: "total" as const, label: "Totalt utestående", stroke: "stroke-fuchsia-400", fill: "fill-fuchsia-400", dot: "bg-fuchsia-400" },
  { key: "forfalt" as const, label: "Forfalt", stroke: "stroke-status-warning", fill: "fill-status-warning", dot: "bg-status-warning" },
  { key: "forfalt91" as const, label: "91+ dager", stroke: "stroke-status-danger", fill: "fill-status-danger", dot: "bg-status-danger" },
];

function ReceivablesHistoryChart({ points }: { points: ReceivablesHistoryPoint[] }) {
  const [active, setActive] = useState(points.length - 1);
  const width = 300;
  const height = 100;
  const padX = 4;
  const padY = 6;
  const maxVal = Math.max(...points.flatMap((p) => [p.total, p.forfalt, p.forfalt91]), 1);
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => padX + i * stepX;
  const yAt = (v: number) => padY + (1 - v / maxVal) * (height - padY * 2);
  const pathFor = (key: "total" | "forfalt" | "forfalt91") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p[key]).toFixed(2)}`).join(" ");
  const activePoint = points[active];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Kundefordringer over tid, per periode">
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="stroke-line" strokeWidth={1} />
        {RECEIVABLES_HISTORY_SERIES.map((s) => (
          <path key={s.key} d={pathFor(s.key)} fill="none" className={s.stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {points.map((p, i) => (
          <g
            key={p.dato}
            className="cursor-pointer"
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(i);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Periode ${formatDateDMY(p.dato)}`}
          >
            <rect x={xAt(i) - (stepX || width) / 2} y={0} width={stepX || width} height={height} fill="transparent" />
            {RECEIVABLES_HISTORY_SERIES.map((s) => (
              <circle key={s.key} cx={xAt(i)} cy={yAt(p[s.key])} r={i === active ? 3 : 1.75} className={s.fill} opacity={i === active ? 1 : 0.55} />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-2xs text-ink-4">
        <span>{formatDateDMY(points[0].dato)}</span>
        <span>{formatDateDMY(points[points.length - 1].dato)}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {RECEIVABLES_HISTORY_SERIES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink-3">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums text-ink-1">{formatKr(activePoint[s.key])}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-center text-2xs text-ink-4">Periode: {formatDateDMY(activePoint.dato)}</div>
    </div>
  );
}

interface ReceivableChange {
  id: string;
  leietaker: string;
  prevUtestaende: number;
  nyUtestaende: number;
  delta: number;
}

function computeReceivableChanges(previous: ReceivableSnapshot, latest: ReceivableSnapshot): ReceivableChange[] {
  const prevById = new Map(previous.rader.map((r) => [r.id, r]));
  const changes: ReceivableChange[] = [];
  for (const row of latest.rader) {
    const prev = prevById.get(row.id);
    if (!prev) continue;
    const delta = Math.round((row.utestaende - prev.utestaende) * 100) / 100;
    if (delta === 0) continue;
    changes.push({ id: row.id, leietaker: row.leietaker, prevUtestaende: prev.utestaende, nyUtestaende: row.utestaende, delta });
  }
  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function ReceivableChangeRow({ change }: { change: ReceivableChange }) {
  const increased = change.delta > 0;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
      <span className="min-w-0 truncate text-ink-2">{change.leietaker}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-2xs text-ink-4">
          {formatKr(change.prevUtestaende)} → {formatKr(change.nyUtestaende)}
        </span>
        <span className={`w-24 shrink-0 text-right font-medium tabular-nums ${increased ? "text-status-danger" : "text-status-positive"}`}>
          {formatKr(change.delta, true)}
        </span>
      </div>
    </div>
  );
}

type ReceivableSortKey = "leietaker" | "utestaende" | "overdue6190" | "overdue91" | "risiko";

const RISK_ORDER: Record<ReceivableRiskLevel, number> = { lav: 1, medium: 2, hoy: 3 };

function ReceivablesSortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: ReceivableSortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: ReceivableSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th className={`px-2 py-1.5 text-2xs font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-0.5 hover:text-ink-1 ${align === "right" ? "ml-auto flex-row-reverse" : ""} ${active ? "text-ink-1" : ""}`}
      >
        {label}
        {active ? dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}
      </button>
    </th>
  );
}

function ReceivablesCard({ today }: { today: string }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Kundefordringer", true);
  const [showAll, setShowAll] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [risks, setRisks] = useState<Record<string, ReceivableRiskLevel>>({});
  const [snapshots, setSnapshots] = useState<ReceivableSnapshot[]>([]);
  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: ReceivableSortKey; dir: "asc" | "desc" } | null>(null);
  const total = RECEIVABLES.reduce((sum, r) => sum + r.utestaende, 0);
  const antallUnderInkasso = RECEIVABLES.filter((r) => r.selskaper.some((s) => s.underInkasso)).length;
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();

  useEffect(() => {
    fetch("/api/receivables/risk")
      .then((r) => r.json())
      .then((d) => setRisks((d.risks ?? {}) as Record<string, ReceivableRiskLevel>))
      .catch(() => {});
  }, []);

  function refreshSnapshots() {
    fetch("/api/receivables/snapshot")
      .then((r) => r.json())
      .then((d) => setSnapshots((d.snapshots ?? []) as ReceivableSnapshot[]))
      .catch(() => {});
  }

  useEffect(refreshSnapshots, []);

  const agingById = useMemo(() => {
    const map = new Map<string, { band6190: number; overdue91: number }>();
    for (const r of RECEIVABLES) {
      const aging = computeAging(r, today);
      map.set(r.id, { band6190: aging.d61_90, overdue91: aging.d91Plus });
    }
    return map;
  }, [today]);

  const totals = useMemo(() => {
    let band6190 = 0;
    let overdue91 = 0;
    for (const v of agingById.values()) {
      band6190 += v.band6190;
      overdue91 += v.overdue91;
    }
    return { band6190, overdue91 };
  }, [agingById]);

  const sorted = useMemo(() => {
    if (!sort) return RECEIVABLES;
    const copy = [...RECEIVABLES];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sort.key) {
        case "leietaker":
          cmp = a.leietaker.localeCompare(b.leietaker);
          break;
        case "utestaende":
          cmp = a.utestaende - b.utestaende;
          break;
        case "overdue6190":
          cmp = (agingById.get(a.id)?.band6190 ?? 0) - (agingById.get(b.id)?.band6190 ?? 0);
          break;
        case "overdue91":
          cmp = (agingById.get(a.id)?.overdue91 ?? 0) - (agingById.get(b.id)?.overdue91 ?? 0);
          break;
        case "risiko": {
          const av = RISK_ORDER[risks[a.id] ?? computeAutoRisk(a, today)];
          const bv = RISK_ORDER[risks[b.id] ?? computeAutoRisk(b, today)];
          cmp = av - bv;
          break;
        }
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [sort, risks, agingById, today]);

  const visible = showAll ? sorted : sorted.slice(0, 20);

  function handleSort(key: ReceivableSortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: key === "leietaker" ? "asc" : "desc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  async function handleSetRisk(id: string, risk: ReceivableRiskLevel) {
    setRisks((prev) => ({ ...prev, [id]: risk }));
    await fetch("/api/receivables/risk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, risk }),
    });
  }

  async function handleStartNewPeriod() {
    setSnapshotConfirmOpen(false);
    try {
      const res = await fetch("/api/receivables/snapshot", { method: "POST" });
      const data = await res.json();
      setSnapshotStatus(data.snapshot?.dato ? `Periode ${formatDateDMY(data.snapshot.dato)} lagret.` : "Kunne ikke lagre periode.");
      refreshSnapshots();
    } catch {
      setSnapshotStatus("Kunne ikke lagre periode.");
    }
  }

  const historyPoints: ReceivablesHistoryPoint[] = snapshots.map((s) => ({
    dato: s.dato,
    total: s.rader.reduce((sum, r) => sum + r.utestaende, 0),
    forfalt: s.rader.reduce((sum, r) => sum + r.forfalt, 0),
    forfalt91: s.rader.reduce((sum, r) => sum + r.forfalt91, 0),
  }));

  const changes = snapshots.length >= 2 ? computeReceivableChanges(snapshots[snapshots.length - 2], snapshots[snapshots.length - 1]) : [];

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-fuchsia-400/60 p-4`}>
      <CardHeader
        title="Kundefordringer"
        subtitle={
          <>
            <span className="font-medium tabular-nums text-ink-2">{formatKr(total)}</span>
            {` · ${RECEIVABLES.length} leietakere`}
            {antallUnderInkasso > 0 ? ` · ${antallUnderInkasso} under inkasso` : ""}
          </>
        }
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Receipt}
        iconColorClass="text-fuchsia-400"
      />
      {!collapsed && (
        <>
          <div className={`-mx-1 overflow-x-auto ${showAll ? "max-h-[480px] overflow-y-auto" : ""}`}>
            <table className="w-full min-w-[460px] table-fixed text-sm">
              <thead className={showAll ? "sticky top-0 z-10 bg-surface-1" : ""}>
                <tr className="text-left text-ink-4">
                  <ReceivablesSortHeader label="Leietaker" sortKey="leietaker" active={sort?.key === "leietaker"} dir={sort?.dir ?? "asc"} onSort={handleSort} className="w-[22%]" />
                  <th className="w-[16%] px-2 py-1.5 text-2xs font-medium">Selskap</th>
                  <ReceivablesSortHeader label="Utestående" sortKey="utestaende" active={sort?.key === "utestaende"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" className="w-[14%] text-right" />
                  <ReceivablesSortHeader label="61-90 dgr" sortKey="overdue6190" active={sort?.key === "overdue6190"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" className="w-[12%] text-right" />
                  <ReceivablesSortHeader label="91+ dgr" sortKey="overdue91" active={sort?.key === "overdue91"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" className="w-[12%] text-right" />
                  <ReceivablesSortHeader label="Risiko" sortKey="risiko" active={sort?.key === "risiko"} dir={sort?.dir ?? "desc"} onSort={handleSort} className="w-[16%] px-1" />
                  <th className="w-[8%] px-2 py-1.5 text-2xs font-medium">Notat</th>
                </tr>
                <tr className="border-t border-line bg-surface-2/70 text-2xs font-medium text-ink-1">
                  <td className="px-2 py-1.5">Totalt</td>
                  <td className="px-2 py-1.5"></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatKr(total)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-status-warning">{formatKr(totals.band6190)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-status-danger">{formatKr(totals.overdue91)}</td>
                  <td className="px-1 py-1.5"></td>
                  <td className="px-2 py-1.5"></td>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <ReceivableRow
                    key={r.id}
                    receivable={r}
                    today={today}
                    comments={comments[commentKey("receivable", r.id)] ?? []}
                    risk={risks[r.id] ?? null}
                    onSetRisk={(risk) => handleSetRisk(r.id, risk)}
                    onAdd={(tekst) => addComment("receivable", r.id, tekst)}
                    onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "receivable", targetId: r.id, commentId, preview })}
                    onToggleRelevance={(commentId, ikkeRelevant) => toggleRelevance("receivable", r.id, commentId, ikkeRelevant)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium text-accent hover:text-accent/80"
            >
              {showAll ? "Vis kun de 20 største" : `Vis alle (${RECEIVABLES.length})`}
            </button>
            {historyPoints.length >= 2 && (
              <button
                type="button"
                onClick={() => setShowTrend((v) => !v)}
                className="text-xs font-medium text-accent hover:text-accent/80"
              >
                {showTrend ? "Skjul utvikling" : "Vis utvikling over tid"}
              </button>
            )}
            {changes.length > 0 && (
              <button
                type="button"
                onClick={() => setShowChanges((v) => !v)}
                className="text-xs font-medium text-accent hover:text-accent/80"
              >
                {showChanges ? "Skjul endringer" : `Endringer siden forrige periode (${changes.length})`}
              </button>
            )}
            <a
              href="/api/receivables/export"
              className="text-xs font-medium text-accent hover:text-accent/80"
            >
              Eksporter til Excel
            </a>
            <button
              type="button"
              onClick={() => setSnapshotConfirmOpen(true)}
              className="text-xs font-medium text-accent hover:text-accent/80"
            >
              Start ny periode
            </button>
            {snapshotStatus && <span className="text-xs text-ink-4">{snapshotStatus}</span>}
          </div>
          {showTrend && historyPoints.length >= 2 && (
            <div className="mt-3 border-t border-line pt-3">
              <ReceivablesHistoryChart points={historyPoints} />
            </div>
          )}
          {showChanges && changes.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-2xs text-ink-4">
                {formatDateDMY(snapshots[snapshots.length - 2].dato)} → {formatDateDMY(snapshots[snapshots.length - 1].dato)}, sortert etter størst endring
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {changes.map((c) => (
                  <ReceivableChangeRow key={c.id} change={c} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          removeComment(pending.targetType, pending.targetId, pending.commentId);
          confirmDelete.cancel();
        }}
      />
      <ConfirmDialog
        open={snapshotConfirmOpen}
        message="Lagre dagens kundefordringer-status som en ny periode? Dette blir grunnlaget for neste sammenligning i Excel-eksporten."
        confirmLabel="Lagre periode"
        confirmVariant="default"
        onCancel={() => setSnapshotConfirmOpen(false)}
        onConfirm={handleStartNewPeriod}
      />
    </div>
  );
}

const JOBB_SECTION_ORDER_KEY = "mitt-dashboard:jobb-section-order:v1";
const DEFAULT_JOBB_SECTION_ORDER = [
  "calendar",
  "contracts",
  "expiry",
  "guarantees",
  "receivables",
  "reminders",
  "events",
  "leasing-managers",
  "tenant-directory",
  "procedure-notes",
  "income-forecast",
];

// Rekkefølgen på boksene kan dras om (usePersistedOrder, samme mønster som Privat-fanen) —
// derfor er dette en id → node-oppslagstabell istedenfor en hardkodet JSX-rekkefølge.
const JOBB_SECTION_NODES: Record<string, (today: string) => React.ReactNode> = {
  calendar: (today) => <CalendarCard today={today} />,
  contracts: (today) => <ContractsCard today={today} />,
  expiry: () => <ExpiryListCard />,
  guarantees: () => <GuaranteesCard />,
  receivables: (today) => <ReceivablesCard today={today} />,
  reminders: () => <JobbRemindersSection />,
  events: () => <JobbEventsSection />,
  "leasing-managers": () => <JobbLeasingManagersCard />,
  "tenant-directory": () => <JobbTenantDirectoryCard />,
  "procedure-notes": () => <JobbProcedureNotesCard />,
  "income-forecast": () => <IncomeForecastSection />,
};

export default function JobbView({
  tasks,
  today,
  now,
}: {
  tasks: Task[];
  today: string;
  now: string;
}) {
  const nowMs = Date.parse(now);
  const [order, setOrder] = usePersistedOrder(JOBB_SECTION_ORDER_KEY, DEFAULT_JOBB_SECTION_ORDER);
  const [reorderMode, setReorderMode] = useState(false);
  const reorderSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  }
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
          // localStorage kan ikke leses under SSR/første render uten hydrerings-
          // avvik — dette MÅ skje i en effekt, ikke avledes i render.
          // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function jumpToOppgaver(sourceFilter?: Filter) {
    if (sourceFilter) setFilter(sourceFilter);
    requestAnimationFrame(() => {
      document.getElementById("oppgaver")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <header className="mb-7">
        <div className="mt-3 flex justify-end">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              placeholder="Søk..."
              aria-label="Søk i oppgaver"
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
      </header>

      <div className="mb-6">
        <CardErrorBoundary>
          <JobbTodaySummary
            tasks={tasks}
            onJumpToAsana={() => jumpToOppgaver("asana")}
            onJumpToTask={(id) => jumpToCase(id)}
          />
        </CardErrorBoundary>
      </div>

      {/* Ekte data: kontrakter, kalender, garantier og kundefordringer · Testdata: ukesgraf.
          Boksene er én flat, fritt sorterbar liste (samme mønster som Privat-fanen) —
          "Endre rekkefølge"-knappen viser dra-håndtak til man trykker "Lagre" igjen. */}
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setReorderMode((v) => !v)}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold uppercase text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          {reorderMode ? "Lagre" : "Endre rekkefølge"}
        </button>
      </div>
      <DndContext sensors={reorderSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="mb-6 flex flex-col gap-3">
            {order.map((id) => {
              const node = JOBB_SECTION_NODES[id]?.(today);
              if (!node) return null;
              return (
                <SortableSection key={id} id={id} reorderMode={reorderMode}>
                  {node}
                </SortableSection>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <p id="oppgaver" className="mb-2 scroll-mt-4 text-2xs uppercase tracking-wider text-ink-3">Oppgaver</p>
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
  );
}
