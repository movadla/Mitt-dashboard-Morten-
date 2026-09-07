"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CardHeader,
  ConfirmDialog,
  MutationError,
  useMutationError,
} from "./CardShell";
import { CommentBadge, CommentThreadBody } from "./CommentsCell";
import { commentKey, useComments } from "./useComments";
import type { Comment } from "@/lib/comments";
import type { ReceivableRiskLevel } from "@/lib/receivableRisk";
import { computeAging, computeAutoRisk, type ReceivableAging } from "@/lib/receivablesAging";
import { getMainBuilding } from "@/lib/receivableBuilding";
import type { ReceivableSnapshot } from "@/lib/receivablesSnapshots";
import {
  RECEIVABLES,
  type Receivable,
  type ReceivableInvoice,
  formatDateDMY,
  formatKr,
} from "@/lib/widgets";
import { ArrowUpRight, ChevronDown, ChevronUp, Receipt } from "lucide-react";

// Delt hoppeknapp brukt i Kontrakter/Utløp/Garantier/Kundefordringer for å
// hoppe til Oppslag med leietakernavnet forhåndsutfylt i søket der — det
// finnes ingen felles ID mellom Fazile/NXT/Asana/Salesforce å slå opp mot,
// så navnesøk er den ærlige (og eneste praktiske) koblingen.
function OppslagLink({ name, onJump }: { name: string; onJump: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(name);
      }}
      aria-label={`Søk «${name}» i Oppslag`}
      title="Søk i Oppslag"
      className="shrink-0 rounded p-0.5 text-ink-4 transition hover:text-accent"
    >
      <ArrowUpRight className="h-3 w-3" />
    </button>
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
  onJumpToOppslag,
}: {
  receivable: Receivable;
  today: string;
  comments: Comment[];
  risk: ReceivableRiskLevel | null;
  onSetRisk: (risk: ReceivableRiskLevel) => void;
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onJumpToOppslag: (name: string) => void;
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
      {/* Under sm er raden et 3-kolonners rutenett i stedet for sju tabellceller
          (2026-09-07). Sju kolonner får aldri plass på en telefon: den gamle
          tabellen presset navnene ned til «Møller ...» og lot beløpene renne
          utover cellene sine og oppå hverandre. Stablet:
            navn ........................... utestående
            selskap        61-90            91+
            risiko ......................... notat
          Fra sm og opp er alt tilbake til vanlige tabellceller. */}
      <tr className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 border-t border-line px-2 py-2.5 transition-colors hover:bg-surface-2/50 sm:table-row sm:gap-0 sm:px-0 sm:py-0">
        {/* col-start-1 + col-end-3, ikke col-span-2: span-varianten setter hele
            grid-column-shorthanden og kan slå ut col-start avhengig av
            regelrekkefølgen i den genererte CSS-en. */}
        <td className="col-start-1 col-end-3 row-start-1 min-w-0 sm:max-w-0 sm:table-cell sm:px-2 sm:py-2">
          <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium text-ink-1 hover:text-ink-1 sm:font-normal sm:text-ink-2"
          >
            {/* role="img" + aria-label (2026-09-07): en tom, ikke-interaktiv <span> med kun
                `title` blir ikke pålitelig lest opp av skjermlesere, så inkasso-flagget var
                usynlig for dem. `title` beholdes for musepekeren. */}
            {underInkasso && (
              <span
                role="img"
                aria-label="Under inkasso"
                title="Under inkasso"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger"
              />
            )}
            {/* Brytes over to linjer på mobil i stedet for å avkortes — å se hvilken
                leietaker det gjelder er hele poenget med raden. Avkortingen beholdes
                fra sm, der kolonnen har en fast bredde å avkorte mot. */}
            <span className="min-w-0 break-words sm:truncate">{r.leietaker}</span>
          </button>
          <OppslagLink name={r.leietaker} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="col-start-3 row-start-1 whitespace-nowrap text-right tabular-nums font-medium text-ink-1 sm:table-cell sm:px-2 sm:py-2 sm:font-normal sm:text-ink-2">
          {formatKr(r.utestaende)}
        </td>
        <td className="col-start-1 row-start-2 min-w-0 break-words text-2xs text-ink-3 sm:max-w-0 sm:table-cell sm:truncate sm:px-2 sm:py-2">
          {multiCompany ? `${r.selskaper.length} selskaper` : r.selskaper[0]?.selskap ?? "—"}
        </td>
        {/* Nullbeløp vises som tomt på mobil og som «–» i tabellen: en kolonne full av
            tankestreker trenger plassen sin på et bredt skjermbilde for å holde
            rutenettet lesbart, men på mobil er det bare støy under navnet. */}
        <td className={`col-start-2 row-start-2 whitespace-nowrap text-right text-2xs tabular-nums sm:table-cell sm:px-2 sm:py-2 sm:text-sm ${band6190 > 0 ? "text-status-warning" : "text-ink-4"}`}>
          {band6190 > 0 ? (
            <>
              <span className="text-ink-4 sm:hidden">61-90&nbsp;</span>
              {formatKr(band6190)}
            </>
          ) : (
            <span className="hidden sm:inline">–</span>
          )}
        </td>
        <td className={`col-start-3 row-start-2 whitespace-nowrap text-right text-2xs tabular-nums sm:table-cell sm:px-2 sm:py-2 sm:text-sm ${overdue91 > 0 ? "text-status-danger" : "text-ink-4"}`}>
          {overdue91 > 0 ? (
            <>
              <span className="text-ink-4 sm:hidden">91+&nbsp;</span>
              {formatKr(overdue91)}
            </>
          ) : (
            <span className="hidden sm:inline">–</span>
          )}
        </td>
        <td className="col-start-1 row-start-3 whitespace-nowrap sm:table-cell sm:px-1 sm:py-2">
          <select
            value={effectiveRisk}
            onChange={(e) => onSetRisk(e.target.value as ReceivableRiskLevel)}
            title={isOverride ? "Manuelt satt" : "Automatisk satt basert på forfalt beløp"}
            aria-label={`Risiko for ${r.leietaker}`}
            className={`w-full max-w-full rounded-lg border bg-surface-2 px-1.5 py-1 text-2xs outline-none focus:border-line-strong ${RISK_META[effectiveRisk].textClass} ${isOverride ? "border-line" : "border-dashed border-line"}`}
          >
            <option value="lav">Lav{effectiveRisk === "lav" && !isOverride ? " (auto)" : ""}</option>
            <option value="medium">Medium{effectiveRisk === "medium" && !isOverride ? " (auto)" : ""}</option>
            <option value="hoy">Høy{effectiveRisk === "hoy" && !isOverride ? " (auto)" : ""}</option>
          </select>
        </td>
        <td className="col-start-3 row-start-3 flex justify-end whitespace-nowrap sm:table-cell sm:px-2 sm:py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {detailsOpen && (
        <tr className="block border-t border-line bg-surface-2/40 sm:table-row">
          <td colSpan={7} className="block px-3 py-2 sm:table-cell sm:pl-9">
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
        <tr className="block border-t border-line bg-surface-2/40 sm:table-row">
          <td colSpan={7} className="block px-3 py-2 sm:table-cell sm:pl-9">
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

// Aldersfordeling for HELE porteføljen samlet (summert på tvers av alle rader, samme bøtter
// som computeAging pr. rad) - egne statusfarger, ikke en kopi av LedigStolpe i
// IncomeForecastSection: 91+ dager er den alarmerende enden og får status-danger, resten
// trappes ned derfra (ikke-forfalt er grønt, 0-30 er nøytralt grått).
// Kun bøttene — ikke `forfalt`/`forfalt30Plus` fra ReceivableAging (2026-09-07). Den
// aggregerte stolpen summerer bare de fem bøttene, og de to avledede feltene lå igjen som
// evige nuller i aggregatet uten at noe leste dem. Egen type i stedet for de døde feltene.
type AgingBuckets = Pick<ReceivableAging, "ikkeForfalt" | "d0_30" | "d31_60" | "d61_90" | "d91Plus">;

const AGING_BUCKETS: {
  key: keyof AgingBuckets;
  label: string;
  colorClass: string;
  // Egen, alltid full-styrke tekstfarge (2026-09-07): colorClass sin /60-uttoning på 31-60-
  // bøtta gir en fin, lesbar ESKALERING på selve STOLPEN (31-60 svakere enn 61-90/91+), men
  // brukt på selve TALL-etiketten ga den en kontrast på ~2,4:1 mot hvitt kort i dagmodus - godt
  // under WCAG sin 4,5:1 for tekst, og leste som deaktivert/nøytral i stedet for et
  // alvorlighetssignal. Etiketten skal alltid være lesbar; kun stolpen toner ned.
  textColorClass: string;
}[] = [
  { key: "ikkeForfalt", label: "Ikke forfalt", colorClass: "text-status-positive", textColorClass: "text-status-positive" },
  { key: "d0_30", label: "0-30 dager", colorClass: "text-ink-3", textColorClass: "text-ink-3" },
  { key: "d31_60", label: "31-60 dager", colorClass: "text-status-warning/60", textColorClass: "text-status-warning" },
  { key: "d61_90", label: "61-90 dager", colorClass: "text-status-warning", textColorClass: "text-status-warning" },
  { key: "d91Plus", label: "91+ dager", colorClass: "text-status-danger", textColorClass: "text-status-danger" },
];

function ReceivablesAgingBar({ aging, total }: { aging: AgingBuckets; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-ink-4/25"
        role="img"
        aria-label="Aldersfordeling av utestående kundefordringer"
      >
        {AGING_BUCKETS.map(({ key, colorClass }) =>
          aging[key] > 0 ? (
            <span
              key={key}
              className={`${colorClass} block h-full bg-current`}
              style={{ width: `${(Math.max(0, aging[key]) / total) * 100}%` }}
            />
          ) : null,
        )}
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs">
        {AGING_BUCKETS.map(({ key, label, textColorClass }) => (
          <span key={key} className={textColorClass}>
            {label}: <span className="font-medium tabular-nums">{formatKr(aging[key])}</span>
          </span>
        ))}
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
    <th className={`px-3 py-2 text-2xs font-medium ${className}`}>
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

type ReceivableSort = { key: ReceivableSortKey; dir: "asc" | "desc" };

// Sorteringsvalgene som er nyttige i praksis, ferdig kombinert med retning —
// på mobil er det ingen kolonneoverskrifter å trykke på, og et eget
// retningsvalg ved siden av ville vært to kontroller for én beslutning.
const MOBILE_SORTS: { id: string; label: string; sort: ReceivableSort | null }[] = [
  { id: "default", label: "Standardrekkefølge", sort: null },
  { id: "utestaende", label: "Størst utestående", sort: { key: "utestaende", dir: "desc" } },
  { id: "overdue91", label: "Mest 91+ dager", sort: { key: "overdue91", dir: "desc" } },
  { id: "overdue6190", label: "Mest 61-90 dager", sort: { key: "overdue6190", dir: "desc" } },
  { id: "risiko", label: "Høyest risiko", sort: { key: "risiko", dir: "desc" } },
  { id: "leietaker", label: "Leietaker A-Å", sort: { key: "leietaker", dir: "asc" } },
];

function ReceivablesMobileSort({ sort, onChange }: { sort: ReceivableSort | null; onChange: (next: ReceivableSort | null) => void }) {
  // Faller tilbake til "default" når tabellen er sortert stigende via en
  // kolonneoverskrift på et bredt skjermbilde — den tilstanden finnes ikke som
  // et valg her, og da er det ærligere å vise ingenting enn feil valg.
  const current = MOBILE_SORTS.find((o) => o.sort?.key === sort?.key && o.sort?.dir === sort?.dir)?.id ?? "default";
  return (
    <label className="mb-2 flex items-center gap-2 text-2xs text-ink-4 sm:hidden">
      Sorter
      <select
        value={current}
        onChange={(e) => onChange(MOBILE_SORTS.find((o) => o.id === e.target.value)?.sort ?? null)}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-2xs text-ink-2 outline-none focus:border-line-strong"
      >
        {MOBILE_SORTS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function JobbReceivablesSection({ today, onJumpToOppslag }: { today: string; onJumpToOppslag: (name: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [risks, setRisks] = useState<Record<string, ReceivableRiskLevel>>({});
  const [risikoLastFeil, setRisikoLastFeil] = useState(false);
  const [snapshots, setSnapshots] = useState<ReceivableSnapshot[]>([]);
  const [snapshotLastFeil, setSnapshotLastFeil] = useState(false);
  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<ReceivableSort | null>(null);
  const total = RECEIVABLES.reduce((sum, r) => sum + r.utestaende, 0);
  const antallUnderInkasso = RECEIVABLES.filter((r) => r.selskaper.some((s) => s.underInkasso)).length;
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  const mutationError = useMutationError();

  // Feilen sies fra om i stedet for å svelges (2026-09-07): et .catch(() => {}) her betydde
  // at tidligere satte risikovurderinger bare forsvant fra kolonnen, og radene falt tilbake
  // til auto-risiko uten et eneste tegn på at noe var galt. !res.ok sjekkes også — API-et
  // svarer med JSON ({ error }) på 500, så `d.risks` ville ellers gitt et tomt, "vellykket" sett.
  useEffect(() => {
    fetch("/api/receivables/risk")
      .then((r) => {
        if (!r.ok) throw new Error("kunne ikke hente risikovurderinger");
        return r.json();
      })
      .then((d) => setRisks((d.risks ?? {}) as Record<string, ReceivableRiskLevel>))
      .catch(() => setRisikoLastFeil(true));
  }, []);

  // Samme feilhåndtering som Nye kontrakter: useComments ruller tilbake den optimistiske
  // endringen selv, men returverdien ble kastet — en mislykket kommentar forsvant lydløst
  // fra skjermen uten at brukeren fikk vite at den ikke ble lagret.
  async function handleAdd(id: string, tekst: string): Promise<boolean> {
    const ok = await addComment("receivable", id, tekst);
    if (!ok) mutationError.show("Kunne ikke legge til kommentaren. Prøv igjen.");
    return ok;
  }

  async function handleToggleRelevance(id: string, commentId: string, ikkeRelevant: boolean) {
    const ok = await toggleRelevance("receivable", id, commentId, ikkeRelevant);
    if (!ok) mutationError.show("Kunne ikke oppdatere kommentaren. Prøv igjen.");
  }

  async function handleConfirmDelete() {
    const pending = confirmDelete.pending;
    if (!pending) return;
    const ok = await removeComment(pending.targetType, pending.targetId, pending.commentId);
    if (!ok) mutationError.show("Kunne ikke slette kommentaren. Prøv igjen.");
    confirmDelete.cancel();
  }

  // Samme resonnement som risikoLastFeil over (2026-09-07): en svelget GET her betød at
  // historikk-grafen bare uteble, visuelt identisk med "ingen perioder lagret ennå" - man kunne
  // ikke se forskjell på tom historikk og en feilet henting. Egen, vedvarende feiltilstand
  // (ikke useMutationError, som selvtømmes etter 4 s og er feil for en lastefeil).
  function refreshSnapshots() {
    fetch("/api/receivables/snapshot")
      .then((r) => {
        if (!r.ok) throw new Error("snapshot-henting feilet");
        return r.json();
      })
      .then((d) => {
        setSnapshots((d.snapshots ?? []) as ReceivableSnapshot[]);
        setSnapshotLastFeil(false);
      })
      .catch(() => setSnapshotLastFeil(true));
  }

  useEffect(refreshSnapshots, []);

  // Full ReceivableAging pr. rad (ikke bare 61-90/91+) - trengs også av den aggregerte
  // aldersstolpen under overskriften (ReceivablesAgingBar).
  const agingById = useMemo(() => {
    const map = new Map<string, ReceivableAging>();
    for (const r of RECEIVABLES) {
      map.set(r.id, computeAging(r, today));
    }
    return map;
  }, [today]);

  const totalAging = useMemo(() => {
    const agg: AgingBuckets = { ikkeForfalt: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91Plus: 0 };
    for (const v of agingById.values()) {
      agg.ikkeForfalt += v.ikkeForfalt;
      agg.d0_30 += v.d0_30;
      agg.d31_60 += v.d31_60;
      agg.d61_90 += v.d61_90;
      agg.d91Plus += v.d91Plus;
    }
    return agg;
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
          cmp = (agingById.get(a.id)?.d61_90 ?? 0) - (agingById.get(b.id)?.d61_90 ?? 0);
          break;
        case "overdue91":
          cmp = (agingById.get(a.id)?.d91Plus ?? 0) - (agingById.get(b.id)?.d91Plus ?? 0);
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

  // Optimistisk oppdatering med tilbakerulling (2026-09-07): uten try/catch ble en feilet
  // PATCH stående igjen i UI-et som en lagret risikoklassifisering — brukeren trodde
  // vurderingen var lagret, og oppdaget først noe var galt ved neste sidelasting.
  // `forrige === undefined` betyr at raden ikke hadde noen manuell overstyring før, og da
  // må nøkkelen fjernes helt (ikke settes til null) så auto-risikoen slår inn igjen.
  async function handleSetRisk(id: string, risk: ReceivableRiskLevel) {
    const forrige = risks[id];
    setRisks((prev) => ({ ...prev, [id]: risk }));
    try {
      const res = await fetch("/api/receivables/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, risk }),
      });
      if (!res.ok) throw new Error("kunne ikke lagre risiko");
    } catch {
      setRisks((prev) => {
        const neste = { ...prev };
        if (forrige === undefined) delete neste[id];
        else neste[id] = forrige;
        return neste;
      });
      mutationError.show("Kunne ikke lagre risikovurderingen. Prøv igjen.");
    }
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
    <div className="border-t-2 border-t-fuchsia-400/60 p-4">
      <CardHeader
        title="Kundefordringer"
        stat={{ value: formatKr(total), label: "utestående" }}
        icon={Receipt}
        iconColorClass="text-fuchsia-400"
      />
      <p className="mb-2 text-2xs text-ink-4">
        {RECEIVABLES.length} leietakere{antallUnderInkasso > 0 ? ` · ${antallUnderInkasso} under inkasso` : ""}
      </p>
      {risikoLastFeil && (
        <p className="mb-2 text-xs text-status-danger">
          Kunne ikke hente lagrede risikovurderinger. Kolonnen viser automatisk risiko til siden lastes på nytt.
        </p>
      )}
      {snapshotLastFeil && (
        <p className="mb-2 text-xs text-status-danger">
          Kunne ikke hente lagrede perioder. Trend og endring siden forrige periode er skjult til siden lastes på nytt.
        </p>
      )}
      <MutationError message={mutationError.message} />
      <div className="mb-3">
        <ReceivablesAgingBar aging={totalAging} total={total} />
      </div>
        <>
          {/* Sortering på mobil: kolonneoverskriftene er skjult der (se thead under),
              så uten denne var tabellen låst til den rekkefølgen den ble lastet i.
              (2026-09-07) */}
          <ReceivablesMobileSort sort={sort} onChange={setSort} />
          <div className={`-mx-1 sm:overflow-x-auto ${showAll ? "max-h-[70vh] overflow-y-auto sm:max-h-[480px]" : ""}`}>
            {/* Bredden er regnet ut fra innholdet, ikke gjettet: «14 253 410 kr» er ~100 px
                bredt, og med tre beløpskolonner + risiko + notat kan ikke sju kolonner
                presses under ~760 px. Den gamle min-w-[460px] ga beløpskolonnene 55 px,
                og siden cellene er whitespace-nowrap rant tallene utover og ble malt oppå
                nabokolonnen i stedet for å bli avkortet. Under sm er tabellen lagt om til
                stablede rader (block/grid), så min-bredden gjelder kun fra sm og opp.
                (2026-09-07) */}
            <table className="block w-full text-sm sm:table sm:min-w-[760px] sm:table-fixed">
              <thead className={`hidden sm:table-header-group ${showAll ? "sticky top-0 z-10 bg-surface-1" : ""}`}>
                <tr className="text-left text-ink-4">
                  <ReceivablesSortHeader label="Leietaker" sortKey="leietaker" active={sort?.key === "leietaker"} dir={sort?.dir ?? "asc"} onSort={handleSort} className="w-[22%]" />
                  <th className="w-[13%] px-2 py-2 text-2xs font-medium">Selskap</th>
                  <ReceivablesSortHeader label="Utestående" sortKey="utestaende" active={sort?.key === "utestaende"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" className="w-[18%] text-right" />
                  <ReceivablesSortHeader label="61-90 dgr" sortKey="overdue6190" active={sort?.key === "overdue6190"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" className="w-[15%] text-right" />
                  <ReceivablesSortHeader label="91+ dgr" sortKey="overdue91" active={sort?.key === "overdue91"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" className="w-[15%] text-right" />
                  <ReceivablesSortHeader label="Risiko" sortKey="risiko" active={sort?.key === "risiko"} dir={sort?.dir ?? "desc"} onSort={handleSort} className="w-[13%] px-1" />
                  <th className="w-[4%] px-2 py-2 text-2xs font-medium">Notat</th>
                </tr>
                <tr className="border-t border-line bg-surface-2/70 text-2xs font-medium text-ink-1">
                  <td className="px-2 py-2">Totalt</td>
                  <td className="px-2 py-2"></td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatKr(total)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-status-warning">{formatKr(totalAging.d61_90)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-status-danger">{formatKr(totalAging.d91Plus)}</td>
                  <td className="px-1 py-2"></td>
                  <td className="px-2 py-2"></td>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {visible.map((r) => (
                  <ReceivableRow
                    key={r.id}
                    receivable={r}
                    today={today}
                    comments={comments[commentKey("receivable", r.id)] ?? []}
                    risk={risks[r.id] ?? null}
                    onSetRisk={(risk) => handleSetRisk(r.id, risk)}
                    onAdd={(tekst) => handleAdd(r.id, tekst)}
                    onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "receivable", targetId: r.id, commentId, preview })}
                    onToggleRelevance={(commentId, ikkeRelevant) => handleToggleRelevance(r.id, commentId, ikkeRelevant)}
                    onJumpToOppslag={onJumpToOppslag}
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
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={handleConfirmDelete}
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
