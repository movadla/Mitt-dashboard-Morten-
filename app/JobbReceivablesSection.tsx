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
import { ArrowUpRight, ChevronDown, ChevronsUpDown, ChevronUp, Receipt } from "lucide-react";

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
  const underInkasso = r.selskaper.some((s) => s.underInkasso);
  const aging = computeAging(r, today);
  const overdue30 = aging.forfalt30Plus;
  const overdue90 = aging.d91Plus;
  const isOverride = risk !== null;
  const effectiveRisk = risk ?? computeAutoRisk(r, today);
  const bygg = getMainBuilding(r.leietaker);
  return (
    <>
      {/* Vanlig tabellrad, samme mønster som Garantioversikt/Utløp/Kontrakter (2026-09-26,
          Morten: "vises som en vanlig tabell slik som de andre tabellene") - ingen egen
          stablet mobil-layout lenger, tabellen skroller horisontalt på smale skjermer i
          stedet (se overflow-x-auto-wrapperen rundt <table>). */}
      <tr className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50" onClick={() => setDetailsOpen((v) => !v)}>
        <td className="px-3 py-2 text-ink-2">
          <div className="flex min-w-0 items-center gap-1.5">
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
            <span className="truncate">{r.leietaker}</span>
            <OppslagLink name={r.leietaker} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-4">{bygg}</td>
        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${overdue30 > 0 ? "font-medium text-status-warning" : "text-ink-4"}`}>
          {overdue30 > 0 ? formatKr(overdue30) : "–"}
        </td>
        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${overdue90 > 0 ? "font-medium text-status-danger" : "text-ink-4"}`}>
          {overdue90 > 0 ? formatKr(overdue90) : "–"}
        </td>
        <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
        <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {detailsOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={6} className="p-0">
            {/* Sticky-wrap (samme mønster som Garantioversikt sin DetailRow): holder
                detaljpanelet synlig når tabellen er skrollet horisontalt i stedet for å bli
                klippet av utenfor viewporten. */}
            <div className="sticky left-0 w-[calc(100vw-2.5rem)] max-w-[520px] px-3 py-2 pl-9">
              <div className="mb-1.5 flex items-center justify-between text-2xs text-ink-4">
                <span>Bygg: {bygg}</span>
                <span className="font-medium text-ink-2">Totalt: {formatKr(r.utestaende)}</span>
              </div>
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
            </div>
          </td>
        </tr>
      )}
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={6} className="p-0">
            <div className="sticky left-0 w-[calc(100vw-2.5rem)] max-w-[520px] px-3 py-2 pl-9">
              <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
            </div>
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

// Portefølje-totaler for de to toppboksene 30+/90+ (2026-09-26 forenkling, Morten: "bare det
// mest nødvendige" - erstatter den gamle femdelte aldersstolpen som viste alle bøttene på én
// gang). `forfalt30Plus` summerer 31-60+61-90+91+ (samme definisjon som ReceivableAging sin
// egen `forfalt30Plus`), `d91Plus` er 90+-boksen.
type PortfolioTotals = Pick<ReceivableAging, "forfalt30Plus" | "d91Plus">;

type ReceivableSortKey = "leietaker" | "bygg" | "overdue30" | "overdue90" | "risiko";

const RISK_ORDER: Record<ReceivableRiskLevel, number> = { lav: 1, medium: 2, hoy: 3 };

// Samme visuelle mønster som SortableTh i Garantioversikt (2026-09-26): alltid synlig
// sorteringsikon (nøytralt når inaktiv, retning når aktiv), ikke bare på wide skjermer.
function ReceivablesSortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: ReceivableSortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: ReceivableSortKey) => void;
  align?: "left" | "right";
}) {
  const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={`px-3 py-2 text-2xs font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 transition hover:text-ink-2 ${active ? "text-ink-2" : "text-ink-4"}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
      </button>
    </th>
  );
}

type ReceivableSort = { key: ReceivableSortKey; dir: "asc" | "desc" };

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

  // Full ReceivableAging pr. rad - trengs til 30+/90+-kolonnene og portefølje-totalene i
  // toppboksene.
  const agingById = useMemo(() => {
    const map = new Map<string, ReceivableAging>();
    for (const r of RECEIVABLES) {
      map.set(r.id, computeAging(r, today));
    }
    return map;
  }, [today]);

  const totalAging = useMemo(() => {
    const agg: PortfolioTotals = { forfalt30Plus: 0, d91Plus: 0 };
    for (const v of agingById.values()) {
      agg.forfalt30Plus += v.forfalt30Plus;
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
        case "bygg":
          cmp = getMainBuilding(a.leietaker).localeCompare(getMainBuilding(b.leietaker));
          break;
        case "overdue30":
          cmp = (agingById.get(a.id)?.forfalt30Plus ?? 0) - (agingById.get(b.id)?.forfalt30Plus ?? 0);
          break;
        case "overdue90":
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
      <CardHeader title="Kundefordringer" icon={Receipt} iconColorClass="text-fuchsia-400" />
      <p className="mb-2 text-2xs text-ink-3">
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
      {/* Tre bokser på samme linje (2026-09-26, Morten: "bare det mest nødvendige") - samme
          mønster som KPI-stripen i Inntektsprognose (v56, 2026-09-18: "tre bokser på samme
          linje", alltid tre kolonner selv på mobil). Erstatter den gamle femdelte
          aldersstolpen, som viste alle bøttene samtidig og var nettopp det rotete Morten pekte
          på. */}
      <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2">
        {(
          [
            ["Totalt utestående", total, "text-ink-1"],
            ["Utestående 30+ dager", totalAging.forfalt30Plus, "text-status-warning"],
            ["Utestående 90+ dager", totalAging.d91Plus, "text-status-danger"],
          ] as const
        ).map(([label, belop, color]) => (
          <div key={label} className="min-w-0 rounded-xl border border-line bg-surface-2 px-1.5 py-2 sm:px-3 sm:py-2.5">
            <p className="truncate text-2xs font-semibold uppercase tracking-wide text-ink-4">{label}</p>
            <p className={`mt-1 truncate text-xs font-semibold tabular-nums sm:text-lg ${color}`}>{formatKr(belop)}</p>
          </div>
        ))}
      </div>
        <>
          <div className={`-mx-1 mt-2 overflow-x-auto ${showAll ? "max-h-[70vh] overflow-y-auto" : ""}`}>
            <table className="w-full min-w-[680px] text-sm">
              <thead className={showAll ? "sticky top-0 z-10 bg-surface-1" : ""}>
                <tr className="text-left text-ink-4">
                  <ReceivablesSortHeader label="Leietaker" sortKey="leietaker" active={sort?.key === "leietaker"} dir={sort?.dir ?? "asc"} onSort={handleSort} />
                  <ReceivablesSortHeader label="Bygg" sortKey="bygg" active={sort?.key === "bygg"} dir={sort?.dir ?? "asc"} onSort={handleSort} />
                  <ReceivablesSortHeader label="30+ dager" sortKey="overdue30" active={sort?.key === "overdue30"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" />
                  <ReceivablesSortHeader label="90+ dager" sortKey="overdue90" active={sort?.key === "overdue90"} dir={sort?.dir ?? "desc"} onSort={handleSort} align="right" />
                  <ReceivablesSortHeader label="Risiko" sortKey="risiko" active={sort?.key === "risiko"} dir={sort?.dir ?? "desc"} onSort={handleSort} />
                  <th className="px-3 py-2 text-2xs font-medium">Notat</th>
                </tr>
                <tr className="border-t border-line bg-surface-2/70 text-2xs font-medium text-ink-1">
                  <td className="px-3 py-2">Totalt</td>
                  <td className="px-3 py-2"></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-status-warning">{formatKr(totalAging.forfalt30Plus)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-status-danger">{formatKr(totalAging.d91Plus)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
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
