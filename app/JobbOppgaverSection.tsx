"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import useSWR, { mutate } from "swr";
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
import type { SfBucket, TaskFilter } from "@/lib/taskTypes";
import type { JobbTaskState } from "@/lib/jobbTaskState";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, CheckIcon } from "./CardShell";

const LONG_PRESS_MS = 600;
const HIGHLIGHT_MS = 2500;
const SECTION_SHELL = "border-t border-line pt-3 mt-3";

type OutlookBucket = OutlookCategory;

const FILTERS: TaskFilter[] = ["all", "salesforce", "asana", "outlook", "teams"];
const SF_BUCKETS: SfBucket[] = ["alle", "faktura", "kreditnota", "garanti", "annet"];
const OUTLOOK_BUCKETS: OutlookBucket[] = ["trenger-oppfolging", "kopi", "til-info"];
const OUTLOOK_BUCKET_LABEL: Record<OutlookBucket, string> = {
  "trenger-oppfolging": "Oppfølging",
  "kopi": "Kopi",
  "til-info": "Til info",
};

const SF_BUCKET_LABEL: Record<SfBucket, string> = {
  alle: "Alle",
  faktura: "Faktura",
  kreditnota: "Kreditnota",
  garanti: "Garanti",
  annet: "Annet",
};

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

export const SOURCE_ACCENT: Record<Source, SourceAccent> = {
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

export function bucketFor(task: Task): SfBucket | null {
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

export function getCaseInfo(task: Task): CaseInfo {
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

export function lastModifiedTime(task: Task): number {
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

export function priorityRank(priority: Priority | undefined): number {
  return priority ? PRIORITY_META[priority].rank : 9;
}

export function actionOwnerRank(task: Task): number {
  if (task.awaiting === "deg!" || task.awaiting === "Morten") return 0;
  if (task.awaiting) return 1;
  const status = getCaseInfo(task).status;
  if (status === "Ny" || status === "Iverksettes") return 0;
  if (status === "Avventer kunde" || status === "Avventer Kunde") return 1;
  // SF- og Outlook-saker uten eksplisitt awaiting er alltid Mortens tur
  if (task.source === "salesforce" || task.source === "outlook") return 0;
  return 2;
}

// Semantiske tokens (DESIGN.md) i stedet for rå Tailwind-skalaer: "Ny" er en
// sak der ballen ligger hos deg — nøyaktig samme betydning som "Din tur"-
// merket, og deler derfor status-action. "Iverksettes" vises som "Venter" og
// er et pågående steg som fortsatt krever oppmerksomhet → status-warning
// (samme gule valør som amber-300 hadde, men nå styrt av temaet). (2026-09-07)
function statusColorClass(status: string | undefined): string {
  if (status === "Ny") return "text-status-action";
  if (status === "Iverksettes") return "text-status-warning";
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

export function SourceIcon({ source, className }: { source: Source; className?: string }) {
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
  highlighted,
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
  highlighted?: boolean;
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
        {(caseInfo.customer || caseInfo.status || due || task.awaiting || task.closeable || isSnoozedExternally || priority === "high") && (
          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate font-medium text-accent">
                {caseInfo.customer ?? ""}
              </span>
              {priority === "high" && (
                <span className="shrink-0 text-2xs font-semibold text-status-danger">Kritisk</span>
              )}
            </div>
            {/* Utsatt og "avventer kunde" var visuelt identiske (begge kun
                opacity-50), selv om den ene er noe DU har valgt å skyve på og
                kan hente fram igjen. Et eget merke skiller dem uten å innføre
                et nytt fargespråk. (2026-09-07) */}
            {isSnoozedExternally && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-3 ring-1 ring-line-strong">
                Utsatt
              </span>
            )}
            {task.closeable ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/25">
                <CheckIcon className="h-3 w-3" />
                Kan lukkes
              </span>
            ) : task.awaiting === "deg!" || task.awaiting === "Morten" || (!task.awaiting && actionOwnerRank(task) === 0) ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium bg-status-action/12 text-status-action">
                Din tur
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
      className={`group rounded-2xl border border-line p-3 shadow-md shadow-black/15 transition hover:border-r-line-strong hover:border-b-line-strong hover:border-l-line-strong ${
        needsAction ? "bg-surface-2 border-line-strong" : "bg-surface-1"
      } ${isDone || dimmed ? "opacity-50" : ""} ${highlighted ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleDone(task.id)}
          aria-label={isDone ? "Marker som ikke ferdig" : "Marker som ferdig"}
          aria-pressed={isDone}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
            isDone
              ? "bg-emerald-500 ring-emerald-500"
              : "bg-transparent ring-line-strong hover:ring-ink-3"
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
            // Langt trykk veksler snooze begge veier — teksten må derfor si
            // hva som faktisk skjer nå, ikke alltid "utsett". (2026-09-07)
            title={isSnoozedExternally ? "Hold inne for å hente fram igjen" : "Hold inne for å utsette"}
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
                {copied ? "Kopiert" : "Kopier til Claude"}
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

export { TaskCard };

// ─── Delt oppgavetilstand (server-lagret) ──────────────────────────────────

const TASK_STATE_KEY = "/api/jobb-task-state";
const EMPTY_TASK_STATE: JobbTaskState = { done: [], priorityOverrides: {}, snoozed: {} };

// Server-lagret (Redis) i stedet for localStorage — "ferdig"/prioritet/snooze
// skal overleve enhetsbytte (telefon <-> laptop), ikke låses til nettleseren
// man satt i da man merket noe.
//
// Tilstanden bor i SWR-cachen og ikke i lokal React-state: JobbView trenger
// antallet åpne oppgaver til nav-boblen HELE tiden, mens dette panelet er
// avmontert så lenge en annen seksjon er valgt. Én cache-nøkkel gir begge
// nøyaktig samme tall uten at tellingen finnes to steder, og optimistisk
// mutate + POST gir samme semantikk som den gamle "hydrer til state og skriv
// tilbake i en effekt"-runden (samme endepunkt, samme body). (2026-09-07)
export function useJobbTaskState() {
  const { data } = useSWR<JobbTaskState>(TASK_STATE_KEY, jsonFetcher);
  const state = data ?? EMPTY_TASK_STATE;
  const done = useMemo(() => new Set(state.done), [state]);

  // Skriv aldri før GET-en har svart: da er `state` fortsatt tom, og en POST
  // ville nullstilt alt som allerede ligger i Redis. (Den gamle
  // hydrer-i-effekt-varianten kastet på sin side bort et klikk gjort i det
  // samme vinduet — begge tilfeller er de første ~100 ms etter innlasting.)
  const loaded = data !== undefined;
  const write = useCallback((next: JobbTaskState) => {
    if (!loaded) return;
    mutate(TASK_STATE_KEY, next, { revalidate: false });
    fetch(TASK_STATE_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {
      /* ignorer forbigående nettverksfeil — tilstanden er fortsatt korrekt lokalt */
    });
  }, [loaded]);

  const toggleDone = useCallback(
    (id: string) => {
      const next = new Set(state.done);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write({ ...state, done: [...next] });
    },
    [state, write],
  );

  const toggleSnooze = useCallback(
    (id: string, lastModifiedAt: string | undefined) => {
      const snoozed = { ...state.snoozed };
      if (snoozed[id]) delete snoozed[id];
      else snoozed[id] = lastModifiedAt ?? new Date().toISOString();
      write({ ...state, snoozed });
    },
    [state, write],
  );

  return {
    done,
    priorityOverrides: state.priorityOverrides as Record<string, Priority>,
    snoozed: state.snoozed,
    toggleDone,
    toggleSnooze,
  };
}

// Én telling, to kallesteder: panelet bruker hele oppslaget til kildefanene,
// JobbView bruker kun .all til nav-boblen.
export function useOpenTaskCounts(tasks: Task[]): Record<TaskFilter, number> {
  const { done } = useJobbTaskState();
  return useMemo(() => {
    const c: Record<TaskFilter, number> = {
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
}

// ─── Panel ─────────────────────────────────────────────────────────────────

// Hva JobbView ber om når man hopper hit fra en annen seksjon: en konkret sak
// (fra "I dag"-kortet) og/eller et forhåndsvalgt kildefilter.
export type OppgaverFocus = { taskId?: string; filter?: TaskFilter };

type OppgaverViewState = {
  filter: TaskFilter;
  sfBucket: SfBucket;
  outlookBucket: OutlookBucket;
  expandedId: string | null;
  detailsOpen: boolean;
  collapsedGroups: Set<string>;
  search: string;
};

// JobbView rendrer kun den aktive seksjonen (og ruten har key={activeId}), så
// panelet monteres på nytt hver gang man bytter fane. Denne rent visuelle
// tilstanden lå tidligere i JobbView og overlevde derfor fanebytte; en
// modul-lokal kopi holder på det uten å flytte state tilbake til
// orkestratoren. Den er bevisst IKKE persistert noe sted — den lever like
// lenge som fanen er åpen, akkurat som før. (2026-09-07)
const viewState: OppgaverViewState = {
  filter: "all",
  sfBucket: "faktura",
  outlookBucket: "trenger-oppfolging",
  expandedId: null,
  detailsOpen: false,
  collapsedGroups: new Set(),
  search: "",
};

function useViewState<K extends keyof OppgaverViewState>(key: K) {
  const [value, setValue] = useState<OppgaverViewState[K]>(viewState[key]);
  const set = useCallback(
    (next: OppgaverViewState[K] | ((prev: OppgaverViewState[K]) => OppgaverViewState[K])) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: OppgaverViewState[K]) => OppgaverViewState[K])(viewState[key])
          : next;
      viewState[key] = resolved;
      setValue(resolved);
    },
    [key],
  );
  return [value, set] as const;
}

function isDimmedCard(task: Task): boolean {
  return actionOwnerRank(task) === 1;
}

export function JobbOppgaverPanel({
  tasks,
  today,
  nowMs,
  focus,
}: {
  tasks: Task[];
  today: string;
  nowMs: number;
  focus?: OppgaverFocus | null;
}) {
  // Fryses ved montering: JobbView nullstiller focus ved neste fanebytte, og
  // da skal ikke et allerede utført hopp kjøre om igjen.
  const [initialFocus] = useState(() => {
    if (focus?.filter) viewState.filter = focus.filter;
    if (focus?.taskId) {
      viewState.expandedId = focus.taskId;
      viewState.detailsOpen = false;
    }
    return focus ?? null;
  });

  const [filter, setFilter] = useViewState("filter");
  const [sfBucket, setSfBucket] = useViewState("sfBucket");
  const [outlookBucket, setOutlookBucket] = useViewState("outlookBucket");
  const [expandedId, setExpandedId] = useViewState("expandedId");
  const [detailsOpen, setDetailsOpen] = useViewState("detailsOpen");
  const [collapsedGroups, setCollapsedGroups] = useViewState("collapsedGroups");
  const [search, setSearch] = useViewState("search");
  const [highlightId, setHighlightId] = useState<string | null>(initialFocus?.taskId ?? null);
  const highlightTimerRef = useRef<number | null>(null);

  const { done, priorityOverrides, snoozed, toggleDone, toggleSnooze } = useJobbTaskState();
  const counts = useOpenTaskCounts(tasks);

  // Hopp hit fra en annen seksjon: panelet monteres først etter fanebyttet, så
  // scrollingen må skje her. Dobbel rAF venter til kortet faktisk er rendret.
  useEffect(() => {
    const taskId = initialFocus?.taskId;
    if (!taskId) return;
    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    return () => window.clearTimeout(timer);
  }, [initialFocus]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  function toggleGroup(g: string) {
    setCollapsedGroups((prev) => {
      const s = new Set(prev);
      if (s.has(g)) s.delete(g);
      else s.add(g);
      return s;
    });
  }

  function isSnoozed(task: Task): boolean {
    const since = snoozed[task.id];
    if (!since) return false;
    if (!task.lastModifiedAt) return true;
    return task.lastModifiedAt <= since;
  }

  function handleToggleSnooze(taskId: string) {
    toggleSnooze(taskId, tasks.find((t) => t.id === taskId)?.lastModifiedAt);
  }

  // Hopp til en annen sak hos samme kunde (fra detaljpanelet) — samme
  // markering/scrolling som når JobbView sender oss hit utenfra.
  function focusTask(id: string) {
    setExpandedId(id);
    setDetailsOpen(false);
    setHighlightId(id);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  const priorityCounts = useMemo(() => {
    const c: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const p = priorityOverrides[t.id] ?? t.priority;
      if (p) c[p] += 1;
    }
    return c;
  }, [tasks, done, priorityOverrides]);

  const sortFn = useCallback(
    (a: Task, b: Task): number => {
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
    },
    [filter, priorityOverrides],
  );

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
    return (tasksByCustomer.get(customer) ?? []).filter((t) => t.id !== task.id);
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
  }, [tasks, filter, visibleSf, outlookBucket, search, sortFn]);

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
    <div className="border-t-2 border-t-accent/60 p-4">
      <CardHeader
        title="Oppgaver"
        stat={{ value: counts.all, label: counts.all === 1 ? "oppgave igjen" : "oppgaver igjen" }}
        icon={ClipboardList}
        iconColorClass="text-accent"
      />
      {/* Prioritetsfordelingen var kun tre fargede prikker+tall - en proporsjonal stolpe gir
          samme informasjon på ett blikk i stedet for at man må lese tre tall og regne selv.
          Skjules når alt er ferdig (counts.all=0), samme mønster som resten av appen. */}
      {counts.all > 0 && (
        <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-ink-4/15">
          {priorityCounts.high > 0 && (
            <div className="h-full bg-status-danger" style={{ width: `${(priorityCounts.high / counts.all) * 100}%` }} />
          )}
          {priorityCounts.medium > 0 && (
            <div className="h-full bg-status-warning" style={{ width: `${(priorityCounts.medium / counts.all) * 100}%` }} />
          )}
          {priorityCounts.low > 0 && (
            <div className="h-full bg-status-positive" style={{ width: `${(priorityCounts.low / counts.all) * 100}%` }} />
          )}
        </div>
      )}
    <div className="mt-3 flex flex-col gap-3">
      <div>
        <div className="flex justify-end">
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
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
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
      </div>

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
          Ingen oppgaver her.
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
              onJumpToCase={focusTask}
              onToggleSnooze={handleToggleSnooze}
              isSnoozedExternally={isSnoozed(task)}
              priority={priorityOverrides[task.id] ?? task.priority}
              relatedCases={relatedCasesFor(task)}
              today={today}
              nowMs={nowMs}
              highlighted={highlightId === task.id}
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
    </div>
    </div>
  );
}

export default JobbOppgaverPanel;
