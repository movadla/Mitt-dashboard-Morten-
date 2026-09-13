"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Info,
  MessageSquare,
  Minus,
  Search,
  Settings,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "./CardShell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateDMY, formatKr } from "@/lib/widgets";
import { addDaysIso, localDateString } from "@/lib/payday";
import {
  BOOKED_3600_3699,
  INVOICED,
  LEIETYPE_BREAKDOWN,
  MANUAL_NXT,
  OWNERSHIP_SHARE_RULES,
  RECONCILIATION,
  REMAINING,
  type ReconciliationStatus,
} from "@/lib/incomeForecast";
import type { BookedTenantsSnapshot } from "@/lib/incomeForecastBookedTenants";
import type { RemainingByggStatus, RemainingTenantsSnapshot } from "@/lib/incomeForecastRemainingTenants";
import type { ContractExpiry2026Snapshot } from "@/lib/contractExpiry2026";
import type { PotentialIncomeCategoryKey, PotentialIncomeSnapshot } from "@/lib/incomeForecastPotential";
// isSystemRow importeres fra tenantForecastSystemRow, IKKE tenantForecastTable - sistnevnte
// importerer kv.ts (server-only, Redis) på toppnivå, så et verdi-import derfra ville dratt hele
// ioredis-pakken inn i denne klientkomponentens bundle og krasjet builden.
import { finnMark, type ReviewMark, type ReviewMarkStatus } from "@/lib/incomeForecastReviewMarkTypes";
import type { TenantForecastGrupper, TenantForecastGruppering, TenantForecastRow, TenantForecastTableSnapshot } from "@/lib/tenantForecastTable";
import type { OmsetningsavregningSnapshot } from "@/lib/omsetningsavregning";
import type { VacantAreasSnapshot } from "@/lib/vacantAreas";
import type { TenantSignal, TenantSignalType } from "@/lib/tenantSignals";
import { computeForecastRollup, type ForecastRollup } from "@/lib/incomeForecastCompute";
import type { IncomeForecastPart, ManualIncomeLine, ManualLineConfidence } from "@/lib/incomeForecastManual";
import type { HistoryPoint } from "@/lib/incomeForecastHistory";
import { vibrate } from "@/lib/haptics";

// v29 (2026-09-08): prognoseåret sto hardkodet som "2026" i et titalls overskrifter, brødtekster
// og to datointervaller, mens alle snapshotene bærer et `ar`-felt. Det betyr at siden begynner å
// lyve i det øyeblikket grunnlaget rulleres til neste år, uten at noe varsler om det. Alle
// snapshotene har samme år, så REMAINING.ar brukes som felles kilde - der en komponent har sitt
// EGET snapshot med `ar`, brukes det i stedet (nærmere sannheten hvis de noen gang spriker).
const PROGNOSE_AR = REMAINING.ar;

const CONFIDENCE_STYLE: Record<ManualLineConfidence, string> = {
  "høy": "bg-status-positive/12 text-status-positive",
  middels: "bg-status-warning/12 text-status-warning",
  lav: "bg-status-danger/12 text-status-danger",
};

const RECONCILIATION_ICON: Record<ReconciliationStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  varsel: AlertTriangle,
  feil: XCircle,
};

const RECONCILIATION_COLOR: Record<ReconciliationStatus, string> = {
  ok: "text-status-positive",
  varsel: "text-status-warning",
  feil: "text-status-danger",
};

function oldestSnapshotDate(): string | null {
  const dates = [
    INVOICED.sistOppdatert,
    BOOKED_3600_3699.sistOppdatert,
    REMAINING.sistOppdatert,
    MANUAL_NXT.sistOppdatert,
    RECONCILIATION.sistOppdatert,
  ].filter(
    (d) => d && d.length > 0,
  );
  if (dates.length === 0) return null;
  return [...dates].sort()[0];
}

// Record<RemainingByggStatus, string> (ikke Record<string, string>) - eksplisitt eksaustiv mot
// unionen i lib/incomeForecastRemainingTenants.ts. Var tidligere Record<string, string>, som lot
// "forklart-historisk-kundenummer"/"forklart-manglende-linje" mangle helt uten at TypeScript sa
// ifra - de fantes i typen og ble produsert av datapipelinen, men rendret som en tom/ustylet
// badge her og falt samtidig ut av REVIEW_STATUSES-arbeidslisten under. Samme mangel fantes IKKE
// i Excel-eksporten (app/api/income-forecast/remaining-tenants/export/route.ts), som allerede
// bruker nøyaktig denne eksaustive Record-formen - portert etikettene derfra.
const BYGG_STATUS_LABEL: Record<RemainingByggStatus, string> = {
  ok: "OK",
  avsluttet: "Avsluttet, nullstilt",
  "ikke-matchet-i-nxt": "Ikke funnet i NXT",
  "forklart-omsetningsleie": "Omsetningsleie i NXT",
  "forklart-kontraktsendring": "Kontraktsendring i år",
  "forklart-engangsgebyr": "Engangsgebyr (exit fee)",
  "forklart-nxt-feilkoding": "Feilkoding i NXT",
  "forklart-historisk-kundenummer": "Overtatt fra gammelt kundenummer",
  "forklart-manglende-linje": "Manglende linje lagt til",
  "intern-mustad": "Intern (Mustad selv)",
  "intern-egenleie": "Egenleie, nullstilt",
  "forklart-parkering-onepark": "Onepark-estimat lagt til",
  "forklart-parkering-uten-fazile-linje": "Parkering uten Fazile-linje",
  "fazile-plan-mangler": "Ingen Fazile-faktura planlagt",
};

const LEIETYPE_STYLE: Record<OmsetningsavregningSnapshot["butikker"][number]["leietype"], string> = {
  Minimumsleie: "bg-surface-3 text-ink-3",
  Omsetningsleie: "bg-status-warning/15 text-status-warning",
  "Fast leie": "bg-surface-3 text-ink-3",
};

// row.remainingStatuser (TenantForecastRow) er en løs string[] - satt av scripts/build-tenant-
// forecast-table.js, ikke garantert nøyaktig RemainingByggStatus ved kompileringstidspunktet -
// derfor en trygg oppslagsfunksjon med fallback her, i stedet for å løsne hele BYGG_STATUS_LABEL
// tilbake til Record<string, string> (som var nettopp det som skjulte funn #1).
function bygStatusLabel(status: string): string {
  return (BYGG_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

type OmsetningsavregningSortKey =
  | "butikk"
  | "bygg"
  | "omsetningKorr"
  | "avtaltOmsProsent"
  | "forventetOmsetningsleie"
  | "fakturert2026"
  | "gjenstar2026"
  | "ekstrafakturering";

function OmsetningsavregningDrilldown({ b }: { b: OmsetningsavregningSnapshot["butikker"][number] }) {
  const gulvavvik = b.gulvavvik ?? null;
  const harGulvavvik = gulvavvik != null && Math.abs(gulvavvik) >= 1000;
  const row = (label: string, value: ReactNode, valueClass = "text-ink-2") => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-3">{label}</span>
      <span className={`text-right tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 border-t border-line bg-surface-1 px-3 py-2.5 text-2xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-3">Type</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${LEIETYPE_STYLE[b.leietype]}`}>{b.leietype}</span>
      </div>
      {b.krevManuellSjekk && (
        <p className="flex items-center gap-1 font-medium text-status-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" /> Krever manuell sjekk - se kommentar under
        </p>
      )}
      {b.kontraktsminimum2026 != null && row("Kontraktsminimum 2026 (Fazile)", formatKr(b.kontraktsminimum2026))}
      {harGulvavvik &&
        row(
          gulvavvik > 0 ? "Fakturert + gjenstår under kontraktsminimum" : "Fakturert + gjenstår over kontraktsminimum",
          formatKr(Math.abs(gulvavvik)),
          gulvavvik > 0 ? "text-status-warning" : "text-ink-2",
        )}
      {b.andelAvAr != null && b.andelAvAr < 1 && row("Aktiv andel av 2026", `${Math.round(b.andelAvAr * 12)}/12 mnd (forventet leie er skalert)`)}
      {b.omsetning2025 != null && (
        <div className="mt-1 border-t border-line/60 pt-1.5">
          {row("Omsetning 2025 (Amesto)", formatKr(b.omsetning2025))}
          {b.omsetningYoyPct != null &&
            row(
              "Omsetning rullerende 12 mnd vs. 2025",
              `${b.omsetningYoyPct > 0 ? "+" : ""}${b.omsetningYoyPct.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`,
              Math.abs(b.omsetningYoyPct) >= 15 ? "text-status-warning" : "text-ink-2",
            )}
          {b.akonto2025 != null && row("À konto leie 2025", formatKr(b.akonto2025))}
          {b.avregning2025 != null && row("Avregnet merleie 2025", formatKr(b.avregning2025), b.avregning2025 > 0 ? "text-status-positive" : "text-ink-3")}
        </div>
      )}
      {b.remainingNavn && (
        <p className="mt-1 text-ink-4">
          Leietaker i leietaker-tabellen: {b.remainingNavn}
          {b.remainingStatus ? ` (status ${b.remainingStatus})` : ""}
          {b.kjerneLinjer && b.kjerneLinjer.length > 0 ? ` - kjerneleie-linjer: ${b.kjerneLinjer.join("; ")}` : ""}
        </p>
      )}
      {b.delerLeieforholdMed.length > 0 && (
        <p className="mt-1 text-ink-4">Deler leieforhold/selskap med: {b.delerLeieforholdMed.join(", ")}</p>
      )}
      {b.kommentar && <p className="mt-1 text-ink-4">{b.kommentar}</p>}
      <p className="text-ink-4">Match: {b.matchStatus}</p>
    </div>
  );
}

function OmsetningsavregningBlock({
  snapshot,
  loading,
}: {
  snapshot: OmsetningsavregningSnapshot | null;
  loading: boolean;
}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Omsetningsavregning", true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const [sort, setSort] = useState<{ key: OmsetningsavregningSortKey; dir: "asc" | "desc" }>({ key: "ekstrafakturering", dir: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showInfo, setShowInfo] = useState(false);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.butikker;
    return snapshot.butikker.filter((b) => b.butikk.toLowerCase().includes(q) || b.bygg.toLowerCase().includes(q));
  }, [snapshot, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string, "nb-NO") : (av as number) - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const visible = sorted.slice(0, visibleCount);

  const totalOmsetning = filtered.reduce((s, b) => s + (b.omsetningKorr ?? 0), 0);
  const totalForventetLeie = filtered.reduce((s, b) => s + (b.forventetOmsetningsleie ?? 0), 0);
  const totalFakturert = filtered.reduce((s, b) => s + (b.fakturert2026 ?? 0), 0);
  const totalGjenstar = filtered.reduce((s, b) => s + (b.gjenstar2026 ?? 0), 0);
  const totalAvregning = filtered.reduce((s, b) => s + (b.ekstrafakturering ?? 0), 0);

  function toggleSort(key: OmsetningsavregningSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  function toggleExpanded(butikk: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(butikk)) next.delete(butikk);
      else next.add(butikk);
      return next;
    });
  }

  function headerButton(label: string, key: OmsetningsavregningSortKey) {
    const active = sort.key === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-0.5 text-2xs font-medium transition hover:text-ink-1 ${active ? "text-ink-1" : "text-ink-4"}`}
      >
        {label}
        {active && (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    );
  }

  return (
    <div id="drilldown-omsetningsavregning" className="scroll-mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Omsetningsavregning"
        subtitle={snapshot ? formatKr(snapshot.totalEkstrafakturering) : "Laster…"}
        alwaysShowSubtitle
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={ShoppingBag}
        iconColorClass="text-status-positive"
      />
      {!collapsed && (
        <>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(30);
              }}
              placeholder="Søk leietaker eller bygg…"
              className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
            />
          </div>
          {loading ? (
            <SkeletonRows count={4} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen leieforhold funnet.</p>
          ) : (
            <>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[780px] text-sm">
                  <thead>
                    <tr className="text-left text-ink-4">
                      <th className="px-3 py-2">{headerButton("Leietaker", "butikk")}</th>
                      <th className="px-3 py-2">{headerButton("Bygg", "bygg")}</th>
                      <th className="px-3 py-2 text-right">{headerButton("Omsetning", "omsetningKorr")}</th>
                      <th className="px-3 py-2 text-right">{headerButton("Oms.-%", "avtaltOmsProsent")}</th>
                      <th className="px-3 py-2 text-right">{headerButton("Forventet leie", "forventetOmsetningsleie")}</th>
                      <th className="px-3 py-2 text-right">{headerButton("Fakturert", "fakturert2026")}</th>
                      <th className="px-3 py-2 text-right">{headerButton("Gjenstår", "gjenstar2026")}</th>
                      <th className="px-3 py-2 text-right">{headerButton("Avregning", "ekstrafakturering")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((b) => {
                      const isOpen = expanded.has(b.butikk);
                      return (
                        <Fragment key={`${b.butikk}-${b.bygg}`}>
                          <tr
                            className="cursor-pointer border-t border-line/60 transition-colors hover:bg-surface-2/50"
                            onClick={() => toggleExpanded(b.butikk)}
                          >
                            <td className="max-w-[160px] truncate px-3 py-2 text-ink-1">
                              <span className="inline-flex items-center gap-1">
                                {b.krevManuellSjekk && <AlertTriangle className="h-3 w-3 shrink-0 text-status-warning" aria-label="Krever manuell sjekk" />}
                                {b.butikk}
                              </span>
                            </td>
                            <td className="max-w-[130px] truncate px-3 py-2 text-ink-3">{b.bygg}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{b.omsetningKorr == null ? "—" : formatKr(b.omsetningKorr)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">
                              {b.avtaltOmsProsent == null ? "—" : `${(b.avtaltOmsProsent * 100).toLocaleString("nb-NO", { maximumFractionDigits: 2 })} %`}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">
                              {b.forventetOmsetningsleie == null ? "—" : formatKr(b.forventetOmsetningsleie)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">
                              {b.fakturert2026 == null ? "—" : formatKr(b.fakturert2026)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{b.gjenstar2026 == null ? "—" : formatKr(b.gjenstar2026)}</td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${
                                b.ekstrafakturering == null ? "text-ink-4" : b.ekstrafakturering > 0 ? "text-status-positive" : "text-ink-3"
                              }`}
                            >
                              {b.ekstrafakturering == null ? "—" : formatKr(b.ekstrafakturering)}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-t border-line">
                              <td colSpan={8} className="p-0">
                                <OmsetningsavregningDrilldown b={b} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line-strong font-semibold">
                      <td className="px-3 py-2 text-ink-1">Totalt ({filtered.length})</td>
                      <td className="px-3 py-2" />
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalOmsetning)}</td>
                      <td className="px-3 py-2" />
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalForventetLeie)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalFakturert)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalGjenstar)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-status-positive">{formatKr(totalAvregning)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {sorted.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 30)}
                  className="mt-2 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                >
                  Vis {Math.min(30, sorted.length - visible.length)} til ({sorted.length - visible.length} gjenstår)
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className="mt-3 flex w-full items-center justify-between border-t border-line pt-2 text-2xs font-medium text-ink-3 hover:text-ink-1"
          >
            Om denne rapporten
            {showInfo ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showInfo && (
            <p className="mt-1.5 text-2xs text-ink-4">
              Pr. leieforhold med minimums- eller omsetningsbasert leie: forventet leie (omsetningsprosent × rullerende
              12 mnd omsetning) mot kjerneleien (minimumsleie/omsetningsleie) som er fakturert og gjenstår å fakturere i
              år, hentet fra samme tall som leietaker-tabellen. Lager, tillegg og lignende holdes utenfor, slik Amesto
              gjør i den faktiske avregningen. Avregning er gulvet på 0 kr, siden minimumsleien allerede er sikret
              gjennom vanlig fakturering. Minimumsleien på CC Vest settes hvert år lik fjorårets realiserte
              omsetningsleie, så estimatet er svært følsomt for omsetningstallet - oppdater Omsetningsleie-fanen før
              hver innlevering. Trykk en rad for kontraktsminimum, 2025-fasit fra Amesto og kommentarer. Kilde:{" "}
              {snapshot?.kilde ?? "…"} (beregnet {snapshot?.sistOppdatert ?? "…"}).
              {snapshot && snapshot.antallKrevManuellSjekk ? <> {snapshot.antallKrevManuellSjekk} leieforhold er merket for manuell sjekk.</> : null}
              {snapshot && snapshot.antallGulvavvik ? (
                <>
                  {" "}
                  {snapshot.antallGulvavvik} leieforhold har fakturert + gjenstår under kontraktsminimum (sum {formatKr(snapshot.sumGulvavvik ?? 0)}) -
                  typisk fordi første kvartal ble fakturert etter fjorårets minimumsleie; differansen kommer inn via avregningen.
                </>
              ) : null}
              {snapshot && snapshot.antallIkkeMatchet > 0 && <> {snapshot.antallIkkeMatchet} leieforhold er ikke funnet i leietaker-tabellen og har ingen avregning.</>}
              {snapshot && snapshot.antallUtelatt > 0 && (
                <> {snapshot.antallUtelatt} leieforhold er utelatt fordi de ikke er omsetningsbaserte ({snapshot.butikkerUtelatt.join(", ")}).</>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SignalEditor({
  id,
  type,
  signal,
  fallbackNavn,
  fallbackBygg,
  onUpdated,
}: {
  id: string;
  type: TenantSignalType;
  signal: TenantSignal | undefined;
  fallbackNavn: string;
  fallbackBygg: string;
  onUpdated: (next: TenantSignal) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prosent, setProsent] = useState(String(signal?.sannsynlighetProsent ?? 0));
  const [notat, setNotat] = useState(signal?.notat ?? "");
  const [saving, setSaving] = useState(false);

  if (!signal && !editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-2xs font-medium text-accent hover:text-accent/80">
        Sett sannsynlighet
      </button>
    );
  }

  async function handleSave() {
    const parsed = Number(prosent);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
    setSaving(true);
    const res = await fetch("/api/income-forecast/tenant-signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sannsynlighetProsent: parsed, notat, type, navn: fallbackNavn, bygg: fallbackBygg }),
    });
    setSaving(false);
    if (res.ok) {
      onUpdated(await res.json());
      setEditing(false);
    }
  }

  if (editing || !signal) {
    return (
      <div className="mt-1.5 rounded-lg border border-line-strong bg-surface-1 p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={prosent}
            onChange={(e) => setProsent(e.target.value)}
            className="w-16 rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm tabular-nums text-ink-1 outline-none"
          />
          <span className="text-2xs text-ink-4">% sannsynlighet</span>
        </div>
        <textarea
          value={notat}
          onChange={(e) => setNotat(e.target.value)}
          placeholder="Notat/kilde…"
          rows={2}
          className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-2 py-1 text-2xs text-ink-2 outline-none"
        />
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-2.5 py-1 text-2xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-2.5 py-1 text-2xs font-medium text-ink-3">
            Avbryt
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="mt-1 block text-left">
      <span className="text-2xs font-medium text-ink-2">{signal.sannsynlighetProsent}% sannsynlighet</span>
      <span className="ml-1.5 text-2xs text-ink-4">({signal.kilde})</span>
      {signal.notat && <p className="text-2xs text-ink-4">{signal.notat}</p>}
    </button>
  );
}

// Delt mellom ContractExpiryRow (Tillegg-fanen) og KontrakterPaUtlopBlock (Prognose-fanen sin
// nye "Kontrakter på utløp"-seksjon) - samme kontraktsnøkkel/linje-detaljer vises begge steder.
function ContractExpiryDetails({ contract }: { contract: ContractExpiry2026Snapshot["contracts"][number] }) {
  return (
    <>
      <p className="text-2xs text-ink-4">
        Kontraktsnøkkel: <span className="font-medium text-ink-2">{contract.kontraktsnokkel}</span>
        {contract.nyKontraktsnokkel && (
          <>
            {" "}
            → Reforhandlet til: <span className="font-medium text-ink-2">{contract.nyKontraktsnokkel}</span>
          </>
        )}
      </p>
      {contract.ekstraI2026 > 0 && (
        <p className="mt-1 text-2xs text-ink-4">
          Ekstra i 2026 hvis fornyet: <span className="font-medium text-ink-2">{formatKr(contract.ekstraI2026)}</span>{" "}
          (ikke med i prognosetotalen)
        </p>
      )}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {contract.lines.map((l) => (
          <p key={l.linjenokkel} className="text-2xs text-ink-4">
            {l.linjeBeskrivelse} ({l.arealtype}) — {formatKr(l.totalArsleie)}, utløp {formatDateDMY(l.linjeSlutt)}
          </p>
        ))}
      </div>
    </>
  );
}

// v28: `advarsler` er live datakvalitetsvarsler fra siste pipeline-kjoring (snapshotenes
// advarsler-felt), `erUtdatert` settes nar RECONCILIATION er eldre enn de andre datakildene.
function ReconciliationPanel({ advarsler, erUtdatert }: { advarsler: string[]; erUtdatert: boolean }) {
  if (RECONCILIATION.checks.length === 0 && advarsler.length === 0) {
    return <p className="text-sm text-ink-3">Ingen avstemmingskontroller kjørt ennå.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {erUtdatert && RECONCILIATION.checks.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-xl border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-2xs text-ink-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
          Kontrollene under er fra {formatDateDMY(RECONCILIATION.sistOppdatert)} — eldre enn andre datakilder i dag. Kronebeløp
          sitert i fritekst (f.eks. &quot;totalsum-plausibel&quot;) kan referere utdaterte tall, selv om selve funnet fortsatt
          stemmer.
        </p>
      )}
      {advarsler.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-status-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> Live varsler fra siste datakjøring ({advarsler.length})
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {advarsler.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl border border-status-warning/30 bg-status-warning/5 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                {/* "ADVARSEL: "-prefikset i selve strengen er redundant her - varseltrekanten og
                    seksjonsoverskriften sier allerede at dette er et varsel. */}
                <p className="min-w-0 text-2xs text-ink-2">{msg.replace(/^ADVARSEL:\s*/, "")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {RECONCILIATION.checks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {advarsler.length > 0 && <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Undersøkte kontroller (historikk)</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {RECONCILIATION.checks.map((c) => {
              const Icon = RECONCILIATION_ICON[c.status];
              return (
                <div key={c.id} className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${RECONCILIATION_COLOR[c.status]}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-1">{c.label}</p>
                    <p className="mt-0.5 text-2xs text-ink-4">{c.notat}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const POTENTIAL_CATEGORY_LABEL: Record<PotentialIncomeCategoryKey, string> = {
  "potensiell-fremtidig-inntekt": "Potensiell fremtidig inntekt",
  "ledige-lokaler": "Potensiell inntekt: ledige lokaler",
  annet: "Potensiell inntekt: annet",
};

// v29 (2026-09-08): SummaryTile er slettet. Den var død kode fram til v17, ble tatt i bruk for
// KpiStrip sin "Total prognose 2026"-flis, og ble død igjen da den flisen ble fjernet (duplikat av
// hero-boksens tall). De tre gjenværende KPI-flisene har hver sin egen struktur - verdi pluss en
// forklarende underlinje, og to av dem er lenker - så en felles "label + beløp"-komponent passer
// ikke lenger på noen av dem.

function PotentialCategoryTile({
  category,
  onUpdated,
  compact,
}: {
  category: PotentialIncomeSnapshot["categories"][number];
  onUpdated: (next: PotentialIncomeSnapshot["categories"][number]) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [belop, setBelop] = useState(String(category.belop));
  const [notat, setNotat] = useState(category.notat);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = Number(belop.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    setSaving(true);
    const res = await fetch("/api/income-forecast/potential", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: category.key, belop: parsed, notat }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      onUpdated(updated);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{POTENTIAL_CATEGORY_LABEL[category.key]}</p>
        <input
          type="text"
          inputMode="decimal"
          value={belop}
          onChange={(e) => setBelop(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-surface-1 px-2 py-1 text-sm tabular-nums text-ink-1 outline-none"
        />
        <textarea
          value={notat}
          onChange={(e) => setNotat(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-lg border border-line bg-surface-1 px-2 py-1 text-2xs text-ink-2 outline-none"
        />
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-2.5 py-1 text-2xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-line px-2.5 py-1 text-2xs font-medium text-ink-3"
          >
            Avbryt
          </button>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex items-baseline justify-between gap-2 text-left text-sm">
        <span className="text-ink-2">{POTENTIAL_CATEGORY_LABEL[category.key]}</span>
        <span className="font-medium tabular-nums text-ink-1">{formatKr(category.belop)}</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition hover:border-line-strong">
      <button type="button" onClick={() => setEditing(true)} className="w-full text-left">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{POTENTIAL_CATEGORY_LABEL[category.key]}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-ink-1">{formatKr(category.belop)}</p>
        <p className="mt-0.5 truncate text-2xs text-ink-4">{category.notat}</p>
      </button>
      {category.key === "ledige-lokaler" && (
        <a href="#drilldown-ledige-lokaler" className="mt-1 inline-block text-2xs text-accent hover:text-accent/80">
          Se ledige arealer ↓
        </a>
      )}
    </div>
  );
}

// Delt mellom MainForecastBox (toppboksen) og KontrakterPaUtlopBlock (Prognose-fanen) -
// garanterer at de to ALLTID viser nøyaktig samme sannsynlighetsvektede sum (v2, 2026-08-29,
// Morten: "tenk som en inntektskontroller" - fant at toppboksen tidligere brukte det u-vektede
// totalEkstraI2026, uavhengig av hva som faktisk var satt pr. kontrakt).
function beregnVektetReforhandlingTotal(snapshot: ContractExpiry2026Snapshot | null, signals: TenantSignal[]): number {
  if (!snapshot) return 0;
  const signalsById = new Map(signals.map((s) => [s.id, s]));
  return snapshot.contracts
    .filter((c) => c.status === "apen")
    .reduce((sum, c) => sum + c.ekstraI2026 * ((signalsById.get(c.kontraktsnokkel)?.sannsynlighetProsent ?? 100) / 100), 0);
}

// Delt mellom KontrakterPaUtlopBlock (som viser dette pr. KONTRAKT) og TenantForecastTable
// (Leieinntekter, som viser dette pr. LEIETAKER-navn - summert over ev. flere åpne kontrakter
// for samme leietaker) - Morten (2026-08-29): "det man velger under kontrakter på utløp
// reflekteres fortsatt ikke opp i leieinntekter" - uten dette viste de to tabellene ulike +/-
// for samme leietaker, siden justeringen tidligere kun ble regnet ut lokalt inni
// KontrakterPaUtlopBlock.
function beregnEkstraVedReforhandlingByNavn(snapshot: ContractExpiry2026Snapshot | null, signals: TenantSignal[]): Map<string, number> {
  return beregnReforhandlingJustering(snapshot, signals).leietaker;
}

// v51 (2026-09-11, Morten: "forskjellig avvik i de tre fanene leietaker, bygg og leietype"):
// justeringen ble kun lagt på i Leietaker-fanen (Map var navnebasert), så Bygg og Leietype viste
// Totalt-avvik uten de 2,57 mill i vektet reforhandling - tre ulike +/- for samme tabell. Nå
// fordeles samme beløp pr. bygg (kontraktens `bygg`, matcher Bygg-radene 1:1) og pr. leietype
// (kontraktslinjenes `arealtype`, som er samme klassifisering som Leietype-radene bruker).
// Summen er identisk i alle tre - det som ikke finner en rad havner i en egen "uplassert"-rad
// (se applyReforhandlingJustering), aldri i ingenting.
type ReforhandlingJustering = Record<TenantForecastGruppering, Map<string, number>>;
const AREALTYPE_TIL_LEIETYPE: Record<string, string> = {
  "El-bil plass": "Annet",
  "Parkering Ute": "Annet",
  "Fast plass": "Annet",
  "Fri flyt": "Annet",
  Kundeparkering: "Annet",
  Kantine: "Restaurant",
};

function beregnReforhandlingJustering(snapshot: ContractExpiry2026Snapshot | null, signals: TenantSignal[]): ReforhandlingJustering {
  const result: ReforhandlingJustering = { leietaker: new Map(), bygg: new Map(), leietype: new Map() };
  if (!snapshot) return result;
  const signalsById = new Map(signals.map((s) => [s.id, s]));
  const leggTil = (m: Map<string, number>, key: string, belop: number) => {
    const k = key.trim().toLowerCase();
    m.set(k, (m.get(k) ?? 0) + belop);
  };
  for (const c of snapshot.contracts) {
    if (c.status !== "apen") continue;
    const p = (signalsById.get(c.kontraktsnokkel)?.sannsynlighetProsent ?? 100) / 100;
    leggTil(result.leietaker, c.leietaker, c.ekstraI2026 * p);
    leggTil(result.bygg, c.bygg, c.ekstraI2026 * p);
    // Pr. linje, siden én kontrakt kan ha linjer med ulik arealtype. Σ lines.ekstraI2026 ==
    // c.ekstraI2026 (verifisert mot snapshotet 2026-09-11, 0 avvik av 64 åpne kontrakter).
    // Fazile-arealtyper som ikke finnes som Leietype-rad i Del A (parkeringsplasser på
    // 36-kontoer, kantine) mappes til nærmeste budsjett-leietype i stedet for å bli "uplassert".
    for (const l of c.lines) leggTil(result.leietype, AREALTYPE_TIL_LEIETYPE[l.arealtype] ?? l.arealtype ?? "Uklassifisert", l.ekstraI2026 * p);
  }
  return result;
}

export interface Hovedprognose {
  bokfort: number;
  // Del av `bokfort` (ikke i tillegg til) - eget felt kun slik at waterfallen kan tegne det som
  // en synlig, lavere-sikkerhet søyle i stedet for usynlig blandet inn i "Bokført".
  manuelleLinjer: number;
  gjenstar: number;
  reforhandlingFull: number;
  potensiellEkstrainntektReforhandling100: number;
  omsetningsavregningSum: number;
  potensiellFremtidig: number;
  ledigeLokaler: number;
  annet: number;
  total: number;
}

// v17 (2026-09-07): utledet av MainForecastBox sin tidligere lokale beregning - løftet ut hit
// slik at den nye KpiStrip (alltid synlig, ikke bak et klikk) kan vise NØYAKTIG samme totaltall
// som toppboksens breakdown, uten å regne det ut på nytt et annet sted (samme "én kilde til
// sannhet"-prinsipp som beregnVektetReforhandlingTotal over).
function beregnHovedprognose(
  rollup: ForecastRollup,
  contractExpiry2026: ContractExpiry2026Snapshot | null,
  tenantSignals: TenantSignal[],
  omsetningsavregning: OmsetningsavregningSnapshot | null,
  potential: PotentialIncomeSnapshot | null,
): Hovedprognose {
  // manuelleLinjer holdes også som EGET felt (under) i tillegg til å telle med i `bokfort` under -
  // `bokfort` (og dermed `total`/"kjernetallet" kjørehistorikken sporer, se lib/incomeForecastHistory.ts)
  // er UENDRET og skal fortsatt inkludere manuelle linjer. Det som var galt (2026-09-07) var at
  // MainForecastBox sin waterfall tegnet dem inn i SAMME "Bokført"-søyle med samme sikkerhet=1 som
  // ekte NXT-bokførte tall - visuelt umulig å skille et manuelt anslag fra et bokført faktum. Fikset
  // ved å gi waterfallen et eget `manuelleLinjer`-felt å tegne som egen, lavere-sikkerhet søyle -
  // se `manuelleLinjer` i Hovedprognose og bruken i MainForecastBox.
  const manuelleLinjer = rollup.delA.manuelleLinjer + rollup.delB.manuelleLinjer;
  const bokfort =
    rollup.delA.fakturertHittil +
    rollup.delB.fakturertHittil +
    rollup.delA.manueltNxtHittil +
    rollup.delB.manueltNxtHittil +
    manuelleLinjer;
  const gjenstar = rollup.delA.gjenstaende + rollup.delB.gjenstaende;
  const reforhandlingFull = beregnVektetReforhandlingTotal(contractExpiry2026, tenantSignals);
  const potensiellEkstrainntektReforhandling100 = contractExpiry2026?.totalEkstraI2026 ?? 0;
  const omsetningsavregningSum = omsetningsavregning?.totalEkstrafakturering ?? 0;
  const potentialByKey = new Map((potential?.categories ?? []).map((c) => [c.key, c]));
  const potensiellFremtidig = potentialByKey.get("potensiell-fremtidig-inntekt")?.belop ?? 0;
  const ledigeLokaler = potentialByKey.get("ledige-lokaler")?.belop ?? 0;
  const annet = potentialByKey.get("annet")?.belop ?? 0;
  const total = bokfort + gjenstar + reforhandlingFull + omsetningsavregningSum + potensiellFremtidig + ledigeLokaler + annet;
  return { bokfort, manuelleLinjer, gjenstar, reforhandlingFull, potensiellEkstrainntektReforhandling100, omsetningsavregningSum, potensiellFremtidig, ledigeLokaler, annet, total };
}

interface WaterfallSegment {
  label: string;
  value: number;
  // 0-1. Hvor sikker inntekten er, ikke hvor stor den er.
  sikkerhet: number;
}

/** Søylediagram over inntektslagene, én linje pr. lag: etikett | søyle | beløp.
 *
 *  v51 (2026-09-11, Morten: "samle waterfall slik at den blå linjen er på linje med teksten,
 *  men bare starter likt på alle linjene"): var tidligere en ekte waterfall (hver søyle startet
 *  der forrige sluttet, med etikett/beløp på egen linje OVER søylen). Nå starter alle søylene ved
 *  samme venstrekant og ligger på samme linje som teksten - et vanlig søylediagram skalert mot
 *  totalen. Negative lag (manuelle linjer) tegnes med |verdi| og beløpet viser fortegnet.
 *
 *  Sikkerhet kodes med OPASITET og ikke med ulike farger. To grunner: den
 *  semantiske paletten er reservert (danger/warning/positive betyr status, og
 *  skal aldri gjenbrukes til noe annet - se DESIGN.md), og en fallende
 *  fylltetthet sier presist det som faktisk er sant her, nemlig at bokført er
 *  penger på konto mens "annet" er et anslag. Sju forskjellige farger ville
 *  sagt at lagene er ulike i SLAG, ikke i sikkerhet. */
function IncomeWaterfall({ segments, total }: { segments: WaterfallSegment[]; total: number }) {
  if (total <= 0 || segments.length === 0) return null;

  const bars = segments.map((s) => ({ ...s, widthPct: (Math.abs(s.value) / total) * 100 }));
  // Etikettkolonnen er fast slik at alle søylene starter på nøyaktig samme x.
  const radKlasse = "grid grid-cols-[10.5rem_minmax(0,1fr)_8.5rem] items-center gap-3";

  return (
    <div className="mb-2 flex flex-col gap-2.5">
      {bars.map((b) => (
        <div key={b.label} className={radKlasse}>
          <span className="min-w-0 truncate text-xs text-ink-2">{b.label}</span>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-4/15">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(b.widthPct, 0.6)}%`, opacity: b.sikkerhet }} />
          </div>
          <span className="text-right text-xs tabular-nums text-ink-2">{formatKr(b.value)}</span>
        </div>
      ))}
      <div className={`${radKlasse} mt-0.5`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">Sum prognose</span>
        <div className="h-3 w-full overflow-hidden rounded-full bg-ink-4/15">
          <div className="h-full w-full rounded-full bg-accent" />
        </div>
        <span className="text-right text-xs font-semibold tabular-nums text-ink-1">{formatKr(total)}</span>
      </div>
      {/* v29 (2026-09-08): kortet ned fra to setninger. At søylene stables ser man; det som IKKE
          er selvforklarende er hva opasiteten koder. Resten var overlapp med kortets undertittel
          ("avstemt manuelt mot Visma NXT og Fazile") og med linja under lista, som er fjernet. */}
      <p className="text-2xs leading-snug text-ink-4">Jo blekere fyll, jo mindre sikkert tallet.</p>
    </div>
  );
}

function MainForecastBox({
  prognose,
  potential,
  onPotentialUpdated,
  history,
  idagIso,
  kpi,
}: {
  prognose: Hovedprognose;
  potential: PotentialIncomeSnapshot | null;
  onPotentialUpdated: (next: PotentialIncomeSnapshot["categories"][number]) => void;
  history: HistoryPoint[];
  idagIso: string;
  // KPI-flisene, rendret nederst i breakdownen (v30). Sendes inn som node i stedet for å tre
  // avvik/budsjett/antall/freshness gjennom denne komponenten, som ikke bruker noen av dem selv.
  kpi?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { bokfort, manuelleLinjer, gjenstar, reforhandlingFull, omsetningsavregningSum, potensiellFremtidig, ledigeLokaler, annet, total } = prognose;

  // Waterfall-segmentene sortert fra mest til minst sikre. `sikkerhet` styrer hvor tett fylt
  // søylen tegnes — se IncomeWaterfall for hvorfor det er opasitet og ikke ulike farger.
  // "Bokført" splittes fra "Mine manuelle linjer" (2026-09-07) - begge inngår i `bokfort` (se
  // beregnHovedprognose), men et manuelt anslag er ikke det samme som et NXT-bokført faktum, og
  // så tidligere visuelt identisk ut (samme søyle, samme sikkerhet=1).
  const waterfallSegments: WaterfallSegment[] = [
    { label: "Bokført (NXT)", value: bokfort - manuelleLinjer, sikkerhet: 1 },
    { label: "Mine manuelle linjer", value: manuelleLinjer, sikkerhet: 0.75 },
    { label: "Gjenstår", value: gjenstar, sikkerhet: 0.82 },
    { label: "Omsetningsavregning", value: omsetningsavregningSum, sikkerhet: 0.62 },
    { label: "Reforhandling (vektet)", value: reforhandlingFull, sikkerhet: 0.46 },
    { label: "Potensiell fremtidig", value: potensiellFremtidig, sikkerhet: 0.3 },
    { label: "Ledige lokaler", value: ledigeLokaler, sikkerhet: 0.3 },
    { label: "Annet", value: annet, sikkerhet: 0.3 },
  ]
    .filter((s) => Math.round(s.value) !== 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-2xl border-2 border-line-strong bg-surface-2 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-1 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          {/* "Full prognose", ikke samme tittel som kortets egen "Inntektsprognose 2026" over -
              denne summen (Hovedprognose.total) er BREDERE enn kortets kjernetall (rollup.totalt):
              den inkluderer også reforhandling/omsetningsavregning/potensial. Samme tittel med to
              ulike tall forvirret tidligere (2026-09-07). */}
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-4">Full prognose {PROGNOSE_AR}</p>
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-4" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-4" />}
        </div>
        <p className="text-3xl font-bold tabular-nums text-ink-1">{formatKr(total)}</p>
        {/* v29: flyttet hit fra KpiStrip sin (nå fjernede) duplikat-flis - trenden hører hjemme
            under tallet den beskriver, ikke i en egen boks med samme beløp. */}
        <TrendIndicator history={history} fraDato={idagIso} naverendeTotal={bokfort + gjenstar} />
        {!open && <p className="text-2xs text-accent">Se breakdown ↓</p>}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          <IncomeWaterfall segments={waterfallSegments} total={total} />
          {/* v50 (2026-09-11, Morten: "overflødig å liste opp bokført, gjenstår osv. igjen etter
              waterfall"): tallista som gjentok waterfallens beløp er fjernet. Den viste dessuten
              "Bokført inkl. manuelle linjer" (536,95 mill) rett under waterfallens "Bokført (NXT)"
              (537,47 mill) - to ulike tall bak nesten samme ord. Reforhandlings-tooltipen om øvre
              grense (fullt potensial ved 100 %) gikk med i samme slengen - fullt potensial vises
              inne i "Kontrakter på utløp"-seksjonen. Under waterfallen ligger nå bare KPI-boksene. */}
          {potential?.categories
            .filter((c) => c.belop !== 0)
            .map((c) => (
              <PotentialCategoryTile key={c.key} category={c} onUpdated={onPotentialUpdated} compact />
            ))}
          {/* v29: "Bokført + Gjenstår er avstemt mot NXT/Fazile." fjernet - sa det samme som
              kortets egen undertittel øverst ("avstemt manuelt mot Visma NXT og Fazile"). */}
          {/* v30 (2026-09-08, Morten: "prognosen må stå øverst og boksene må ligge nederst i
              breakdown"): KPI-flisene (avvik mot budsjett / til gjennomgang / eldste datakilde)
              lå tidligere OVER denne boksen og skjøv selve prognosetallet ned. De er kontekst til
              totalen, ikke noe man leser først, så de ligger nå nederst i breakdownen. */}
          {kpi && <div className="mt-2 border-t border-line pt-3">{kpi}</div>}
        </div>
      )}
    </div>
  );
}

// v31 (2026-09-08): eneste rest av den fjernede Tillegg-fanen - en kollapset beholder for de tre
// tingene der som var funksjon og ikke informasjon (manuelle linjer, backup-eksport, live varsler).
// Kollapset som default: de brukes sjelden, og hele poenget med å fjerne fanen var å få bort støy.
function VerktoyOgAvstemming({ children }: { children: React.ReactNode }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Verktøy", true);
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Verktøy og avstemming"
        subtitle="Manuelle linjer, backup og varsler fra siste datakjøring"
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Settings}
        iconColorClass="text-ink-3"
      />
      {!collapsed && children}
    </div>
  );
}

export interface DataSourceFreshness {
  label: string;
  dato: string;
}

// v17 (2026-09-07): "hvor gammel er den ELDSTE kilden" (oldestSnapshotDate over) sier ALDRI hvilken
// kilde som faktisk er gammel - en kontrollør trenger å vite HVILKEN, ikke bare AT. Denne bygger
// listen KpiStrip sin datakilde-tile viser i tooltipen, sortert eldst først.
function dataSourceFreshnessList(extra: DataSourceFreshness[]): DataSourceFreshness[] {
  const base: DataSourceFreshness[] = [
    { label: "Fakturert (Visma NXT)", dato: INVOICED.sistOppdatert },
    { label: "Bokført konto 3600-3699", dato: BOOKED_3600_3699.sistOppdatert },
    { label: "Gjenstår (Fazile)", dato: REMAINING.sistOppdatert },
    { label: "Manuelle bilag i NXT", dato: MANUAL_NXT.sistOppdatert },
    { label: "Avstemmingskontroller", dato: RECONCILIATION.sistOppdatert },
    // v20 (2026-09-07): manglet her tidligere - begge er hardkodede konstanter med egen
    // sistOppdatert, samme "kan gå stille foreldet"-risiko som resten av lista.
    { label: "Full 2026-verdi per leietype", dato: LEIETYPE_BREAKDOWN.sistOppdatert },
    { label: "Eierandel-regler", dato: OWNERSHIP_SHARE_RULES.sistOppdatert },
    ...extra,
  ].filter((d) => d.dato && d.dato.length > 0);
  return base.sort((a, b) => a.dato.localeCompare(b.dato));
}

interface SyncAvvik {
  label: string;
  hardkodetDato: string;
  liveDato: string;
}

// v19 (2026-09-07, "avstemming"-gjennomgangen): REMAINING og BOOKED_3600_3699 er konstanter limt
// inn for hånd i lib/incomeForecast.local.ts/.anon.ts etter en skriptkjøring - toppboksen/KpiStrip
// bruker DEM, mens drilldown-blokkene ("Gjenstår per leietaker", "Bokført per leietaker") leser
// live fra Redis. `npm run refresh:income-forecast` oppdaterer KUN Redis, ikke disse konstantene -
// glemmes lim-inn-steget, viser toppen og detaljen to ulike tall UTEN at noe sier ifra. Denne
// sammenligner sistOppdatert-datoene og gir et konkret, synlig varsel når de ikke stemmer.
function finnUsynkroniserteKonstanter(
  remainingTenantsSnapshot: RemainingTenantsSnapshot | null,
  bookedTenantsSnapshot: BookedTenantsSnapshot | null,
): SyncAvvik[] {
  const ut: SyncAvvik[] = [];
  if (remainingTenantsSnapshot && remainingTenantsSnapshot.sistOppdatert !== REMAINING.sistOppdatert) {
    ut.push({ label: "Gjenstår å fakturere", hardkodetDato: REMAINING.sistOppdatert, liveDato: remainingTenantsSnapshot.sistOppdatert });
  }
  if (bookedTenantsSnapshot && bookedTenantsSnapshot.sistOppdatert !== BOOKED_3600_3699.sistOppdatert) {
    ut.push({ label: "Bokført", hardkodetDato: BOOKED_3600_3699.sistOppdatert, liveDato: bookedTenantsSnapshot.sistOppdatert });
  }
  return ut;
}

// Vises KUN når det faktisk er et avvik - normaltilstanden er at denne ikke tegner noe som helst,
// slik at den ikke legger til støy når alt er i synk (se DESIGN-notatet ved IncomeWaterfall).
// v25 (2026-09-07, Morten: "denne delen må være skjult under, slik at man heller kan få infoen om
// man vil") - startet som en alltid-åpen rød boks, som var for påtrengende for noe som (forhåpentligvis)
// sjelden inntreffer. Nå en smal, lukket rad som kun sier AT noe er ute av synk - detaljen (hvilke
// datoer, hva som må gjøres) er bak et klikk, ikke tredd på leseren.
function SyncVarsel({ avvik }: { avvik: SyncAvvik[] }) {
  const [open, setOpen] = useState(false);
  if (avvik.length === 0) return null;
  return (
    <div className="rounded-xl border border-status-danger/40 bg-status-danger/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-status-danger"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Hovedtallet er ute av synk med detaljen ({avvik.length})
        {open ? <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />}
      </button>
      {open && (
        <div className="flex flex-col gap-1 px-3 pb-3 text-2xs text-ink-2">
          {avvik.map((a) => (
            <p key={a.label}>
              {a.label}: totalen øverst er fra {formatDateDMY(a.hardkodetDato)}, men leietaker-detaljen i Tillegg-fanen er fra{" "}
              {formatDateDMY(a.liveDato)}. Lim inn nye tall i lib/incomeForecast.local.ts/.anon.ts etter neste refresh - se scripts/REFRESH.md.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Finner punktet nærmest `dagerTilbake` dager før `fraDato` (ikke nødvendigvis eksakt, siden
// punkter kun finnes for dager noen faktisk åpnet siden) - eldste punkt ELDRE ELLER LIK målet,
// slik at en "7 dager siden"-sammenligning fortsatt fungerer selv om ingen så på siden akkurat
// den dagen. Ren funksjon, bevisst holdt HER (ikke i lib/incomeForecastHistory.ts) - den filen
// importerer kv.ts (server-only), og en verdi-import derfra ville dratt Redis-klienten inn i
// klient-bundlen hvis noe herfra importeres som annet enn `import type`.
function finnSammenligningspunkt(punkter: HistoryPoint[], fraDato: string, dagerTilbake: number): HistoryPoint | null {
  const mal = new Date(fraDato + "T00:00:00Z");
  mal.setUTCDate(mal.getUTCDate() - dagerTilbake);
  const malIso = mal.toISOString().slice(0, 10);
  const kandidater = punkter.filter((p) => p.dato <= malIso && p.dato !== fraDato).sort((a, b) => b.dato.localeCompare(a.dato));
  return kandidater[0] ?? null;
}

// v18 (2026-09-07, "sikre tallgrunnlaget/visualiser bedre"-gjennomgangen): liten håndrullet
// SVG-sparkline av kjørehistorikken - samme prinsipp som IncomeWaterfall (ingen chart-bibliotek i
// prosjektet, og dette er for lite til å rettferdiggjøre å legge til ett). Kun retning/forløp, ikke
// eksakte verdier - de vises allerede i TrendIndicator og selve totalen over.
function HistorySparkline({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return null;
  const width = 96;
  const height = 24;
  const verdier = history.map((p) => p.kjerneTotal);
  const min = Math.min(...verdier);
  const max = Math.max(...verdier);
  const span = max - min || 1;
  const punkter = history.map((p, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - ((p.kjerneTotal - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="mt-1 text-ink-4" aria-hidden="true">
      <polyline points={punkter.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TrendIndicator({ history, fraDato, naverendeTotal }: { history: HistoryPoint[]; fraDato: string; naverendeTotal: number }) {
  const sammenligning = useMemo(() => finnSammenligningspunkt(history, fraDato, 7), [history, fraDato]);
  // v39: returnerer null i stedet for "Ingen tidligere målepunkt ennå" - en linje som bare sier
  // at det ikke finnes noe å vise er støy, og den sto rett under hovedtallet.
  if (!sammenligning) return null;
  const delta = Math.round(naverendeTotal - sammenligning.kjerneTotal);
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <>
      <p className="mt-1 flex items-center gap-1 text-2xs text-ink-3">
        <Icon className="h-3 w-3 shrink-0" />
        {delta === 0 ? "Uendret" : formatKr(delta, true)} siden {formatDateDMY(sammenligning.dato)}
        <span className="text-ink-4"> (bokført+gjenstår)</span>
      </p>
      <HistorySparkline history={history} />
    </>
  );
}

// v17 (2026-09-07, "gjør som en inntektskontroller"-gjennomgangen): alltid synlig oppsummerings-
// stripe øverst på Prognose-fanen. Før dette var MainForecastBox og alle undertabeller kollapset
// som default (usePersistedCollapse(..., true)) - siden viste i praksis kun ETT tall (totalen) før
// man klikket seg gjennom flere kort.
//
// v50 (2026-09-11, Morten): boksene skal være "Avvik mot budsjett" og "Reforhandling" (pluss
// eventuelt én til han ikke har bestemt seg for). "Mangler fakturering" er ute - lista finnes
// fortsatt under Verktøy og avstemming. "Eldste datakilde" er flyttet opp i kortheaderen som
// liten tekst (se DatakildeHeaderTekst) - "slik at man kun ser den om man vet om den".
function KpiStrip({
  avvikTotal,
  budsjettTotal,
  reforhandlingVektet,
  reforhandlingFulltPotensial,
}: {
  avvikTotal: number;
  budsjettTotal: number;
  reforhandlingVektet: number;
  reforhandlingFulltPotensial: number;
}) {
  const avvikPct = budsjettTotal !== 0 ? (avvikTotal / budsjettTotal) * 100 : null;

  // v29 (2026-09-08, Morten: "visuelt rent, ikke doble forklaringer"): stripen hadde en fjerde
  // flis "Total prognose 2026" med NØYAKTIG samme beløp som hero-boksen rett under, i dobbelt så
  // stor skrift - samme tall to ganger med seksti piksler mellom seg, pluss "Kjernetall" oppe i
  // kortheaderen. Flisen er fjernet og trendlinjen flyttet ned under hero-boksens egen total, der
  // den står ved siden av tallet den faktisk beskriver.
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <a href="#leieinntekter" className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition hover:border-line-strong">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Avvik mot budsjett</p>
        <p className={`mt-1 text-lg font-semibold tabular-nums ${avvikTotal >= 0 ? "text-status-positive" : "text-status-danger"}`}>
          {formatKr(avvikTotal, true)}
        </p>
        <p className="mt-1 text-2xs text-ink-4">
          {avvikPct === null ? "Uten budsjettgrunnlag" : `${avvikPct >= 0 ? "+" : ""}${avvikPct.toFixed(1)} % · budsjett ${formatKr(budsjettTotal)}`}
        </p>
      </a>
      <a href="#kontrakter-pa-utlop" className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition hover:border-line-strong">
        {/* v50: het "Reforhandling" - Morten ville ha "Risiko" (2026-09-11). Tallet er fortsatt
            det vektede reforhandlingsbeløpet fra Kontrakter på utløp. */}
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Risiko</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-ink-1">{formatKr(reforhandlingVektet)}</p>
        <p className="mt-1 text-2xs text-ink-4">vektet · {formatKr(reforhandlingFulltPotensial)} ved 100 %</p>
      </a>
    </div>
  );
}

// v50: eldste datakilde som liten tekst i kortheaderen, ved siden av "Sist oppdatert". Hover
// gir hele lista. Gul når eldste kilde er 14 dager eller mer - samme grense som den gamle
// KPI-flisen brukte.
function DatakildeHeaderTekst({ freshness, idagIso, lastUpdated }: { freshness: DataSourceFreshness[]; idagIso: string; lastUpdated: string | null }) {
  const eldste = freshness[0] ?? null;
  const dagerGammel = eldste ? Math.round((new Date(idagIso).getTime() - new Date(eldste.dato).getTime()) / 86400000) : null;
  const eldsteErGammel = dagerGammel !== null && dagerGammel >= 14;
  if (!lastUpdated && !eldste) return <>Ingen data ennå</>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="cursor-default">
            {lastUpdated && `Sist oppdatert ${formatDateDMY(lastUpdated)}`}
            {lastUpdated && eldste && " · "}
            {eldste && (
              <span className={eldsteErGammel ? "text-status-warning" : undefined}>
                eldste kilde {formatDateDMY(eldste.dato)}
              </span>
            )}
          </span>
        }
      />
      <TooltipContent>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Alle datakilder, eldst først:</p>
          {freshness.map((f) => (
            <p key={f.label}>
              {formatDateDMY(f.dato)} — {f.label}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// v18 (2026-09-07, "visualiser bedre"-gjennomgangen): de største avvikene mot budsjett vises i
// dag kun som sorterte tabellrader i Leieinntekter - må skumme hele tabellen for å se hvem som
// stikker seg ut. Denne viser topp 8 (etter |avvik|) som stolper skalert til den STØRSTE av dem,
// grønt/rødt etter samme fortegn-konvensjon som resten av siden (over/under budsjett).
//
// v28 (2026-09-08, Morten så blokken i nettleseren): blokken var direkte VILLEDENDE. Den filtrerte
// bort systemradene (isSystemRow) fordi de ikke er ekte leietakere - men de 404 ekte leietakerne
// summerer seg til +5,06 mill kr, mens de 21 skjulte systemradene bærer −12,19 mill kr (19
// Ledig-rader −6,42 mill, "Mustad Eiendom (intern bruk)" −5,77 mill). Resultatet var at sju av
// åtte søyler var grønne rett under en KPI som sa −4,6 mill: seksjonen som skal FORKLARE avviket
// viste motsatt konklusjon av totalen over den, fordi hele underdekningen lå i radene den skjulte.
// Fikset ved å (a) vise de to strukturelle samlepostene som egne søyler - de er tross alt de to
// største enkeltpostene - og (b) legge på en avstemmingsfot som går hele veien fra topp 8 til
// KPI-stripens "Avvik mot budsjett", slik at ingenting lenger kan falle ut usett. Samlepostene er
// fortsatt IKKE med i topp 8-UTVALGET; de er strukturelle poster, ikke leietakere med et avvik.

// v39 (2026-09-11): "Leieforhold til gjennomgang" og "Størst avvik mot budsjett" er fjernet fra
// siden - Morten hadde gått gjennom hele arbeidslista (41 vurderinger registrert), og avvikene ser
// man ved å sortere Leieinntekter-tabellen. Men ÉN ting derfra var en åpen oppgave og ikke bare
// informasjon: leieforhold der beløpet er reelt og skal stå, men der faktureringen ikke har skjedd.
// Den lista lever videre her, som egen seksjon, slik at den ikke forsvant sammen med resten.
//
// Merkene settes nå med scripts/sett-vurdering.js (knappene lå i den fjernede seksjonen).
// v39: statusene som faktisk BETYR "ikke fakturert". Merket settes pr. leietaker (bygg = ""), og
// uten dette filteret dro et slikt merke med seg ALLE leietakerens bygg - også de som er helt
// normale og bare har et gjenstående beløp. Ecoguard fikk 383 000 kr og Mustad Eiendomsdrift
// 411 000 kr inn i lista på den måten, mot 9 546 og 37 697 som er de reelle.
const IKKE_FAKTURERT_STATUSER = new Set(["fazile-plan-mangler", "ikke-matchet-i-nxt"]);

function ManglerFaktureringBlock({
  snapshot,
  marks,
}: {
  snapshot: RemainingTenantsSnapshot | null;
  marks: ReviewMark[];
}) {
  const rader = useMemo(() => {
    if (!snapshot) return [];
    const ut: { navn: string; bygg: string; belop: number; notat: string }[] = [];
    for (const t of snapshot.tenants) {
      for (const b of t.byggGrupper) {
        if (!IKKE_FAKTURERT_STATUSER.has(b.status)) continue;
        const m = finnMark(marks, t.navn, b.bygg);
        if (m?.status !== "mangler-fakturering") continue;
        // v39: merket settes pr. LEIETAKER (bygg = ""), så det treffer alle byggene hans - også
        // de som står i 0 kr. De hører ikke hjemme i en liste over penger som skal faktureres.
        if (Math.round(b.gjenstarTotal) === 0) continue;
        ut.push({ navn: t.navn, bygg: b.bygg, belop: b.gjenstarTotal, notat: m.notat });
      }
    }
    return ut.sort((a, b) => b.belop - a.belop);
  }, [snapshot, marks]);

  if (rader.length === 0) return null;
  const sum = rader.reduce((s2, m) => s2 + m.belop, 0);

  return (
    <div id="mangler-fakturering" className="scroll-mt-4 rounded-xl border border-status-danger/30 bg-status-danger/[0.06] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-status-danger">
        <AlertTriangle className="h-3.5 w-3.5" /> Mangler fakturering ({rader.length})
      </p>
      <div className="flex flex-col gap-1">
        {rader.map((m) => (
          <div key={`${m.navn}||${m.bygg}`} className="flex items-baseline justify-between gap-3 text-2xs">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-ink-2">{m.navn}</span>
              <span className="shrink-0 truncate text-ink-4">{m.bygg}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink-1">{formatKr(m.belop)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-status-danger/20 pt-1.5 text-2xs font-semibold">
        <span className="text-ink-2">Sum ikke fakturert</span>
        <span className="tabular-nums text-ink-1">{formatKr(sum)}</span>
      </div>
      <p className="mt-1 text-3xs leading-snug text-ink-4">
        Beløpene står i prognosen og er ikke usikre — det er faktureringen som mangler. Følges opp mot Fazile/regnskap.
      </p>
    </div>
  );
}

// v3 (2026-08-29, Morten: "vist kontoer og så fakturert pr konto (alignes under kolonnen
// Fakturert), så linjer fra Fazile og gjenstår å fakturere (aligned under den kolonnen)") -
// erstatter den forrige enkle linjelisten (som viste Fazile sin kontraktsfestede ÅRSVERDI, ikke
// hva som faktisk gjensto) med to side-om-side seksjoner som speiler foreldreraden sine to
// tallkolonner: NXT-kontoer -> Fakturert (venstre), Fazile-linjer -> Gjenstår (høyre, med
// gjenstår proporsjonalt fordelt over linjene - se gjenstarShare i build-tenant-forecast-table.js).
// v40 (2026-09-11, Morten: "legg til kontonavn på kontoer"): kontonummer alene sier ingenting om
// HVA beløpet er - 3615 på 2,26 mill ser ut som husleie til den som ikke kan kontoplanen, men er
// "Erstatning", altså exit fee. Hentet fra NXT (generalLedgerAccount, konto 3600-3699, Mustad
// Eiendom AS 2026-09-11). Statisk her fordi kontoplanen endres svært sjelden og drilldownen ikke
// skal gjøre et API-kall for å vise en etikett; mangler et nummer, vises nummeret alene.
const KONTONAVN: Record<string, string> = {
  "3600": "Leie kontor avg. pl",
  "3601": "Leie kontor avg. fritt",
  "3602": "Leie kontor - avregning og periodisering",
  "3610": "Leierabatt kontor avg. pl",
  "3611": "Leierabatt kontor avg. fritt",
  "3612": "Leierabatt - avregning og periodisering",
  "3615": "Erstatning",
  "3620": "Leie handel avg. pl",
  "3621": "Leie handel avg. fritt",
  "3622": "Leie handel - avregning og periodisering",
  "3630": "Leie omsetning avg. pl",
  "3631": "Leie omsetning avg. fritt",
  "3632": "Leie omsetning - avregning og periodisering",
  "3635": "Leierabatt handel avg. pl",
  "3636": "Leierabatt handel avg. fritt",
  "3637": "Leierabatt - avregning og periodisering",
  "3640": "Leie parkering avg. pl",
  "3641": "Leie parkering avg. fritt",
  "3642": "Leie parkering - avregning og periodisering",
  "3650": "Andre leieinntekter avg. pl",
  "3651": "Andre leieinntekter avg. fritt",
  "3652": "Andre leieinntekter - avregning og periodisering",
  "3658": "Leierabatt andre leieinntekter avg. pl",
  "3659": "Leierabatt andre leieinntekter avg.fritt",
  "3690": "Leie konsern avg. pl",
  "3691": "Leie konsern avg. fritt",
  "3692": "Leie konsern avg. pl - fellesregistrerte selskaper",
  "3693": "Leie konsern - avregning og periodisering",
};

// v42 (2026-09-11, Morten: "få det aligned under det som er tittelen i hovedkolonnen over"):
// nedtrekket var et eget CSS-rutenett inne i ÉN tabellcelle (colSpan), og kunne derfor aldri treffe
// tabellens kolonnebredder - det var bare tilfeldig hvor nær det havnet, og skjevheten flyttet seg
// med innholdet. Nå returneres ekte <tr>-rader i SAMME tabell, med én <td> pr. kolonne. Da gjør
// nettleserens tabell-layout alignmenten selv, eksakt, uansett innhold. Det fjerner samtidig de
// dupliserte kolonneoverskriftene inni nedtrekket - radene står under tabellens egne overskrifter.
function TenantDrilldownRows({
  row,
  flyttetInn = [],
  harStartSluttKolonne,
  harKommentarKolonne,
  antallKolonner,
  kommentarer,
  onSaveKommentar,
}: {
  row: TenantForecastRow;
  flyttetInn?: TenantForecastRow[];
  harStartSluttKolonne: boolean;
  harKommentarKolonne: boolean;
  antallKolonner: number;
  // Nøkkel = "<leietaker>||<linjenøkkel>", normalisert til lowercase - samme oppslag som
  // leietakerkommentarene bruker.
  kommentarer?: Record<string, string>;
  onSaveKommentar?: (navn: string, kommentar: string) => void;
}) {
  const kontoer = row.kontoer ?? [];
  const erLedigRad = row.ledigOpprinneligBudsjett !== undefined;
  // Budsjett finnes KUN pr. leietaker, ikke pr. konto - det finnes ingen kontofordelt budsjettkilde
  // i grunnlaget. Hele budsjettet vises derfor på hovedleie-kontoen 3600 (ellers første konto), slik
  // at Budsjett-kolonnen har ett sted å stå og summen nederst stemmer.
  const budsjettPaKontoIndeks = Math.max(0, kontoer.findIndex((k) => String(k.konto) === "3600"));

  const celle = "whitespace-nowrap px-3 py-1 text-right tabular-nums text-2xs text-ink-3";
  const navnCelle = "max-w-[240px] truncate px-3 py-1 pl-6 text-2xs text-ink-3";

  // v51 (2026-09-11, Morten: "gi muligheten for meg å kommentere på hver linje under i den åpne
  // seksjonen"): hver detaljlinje har nå sin egen kommentar. Den lagres i SAMME Redis-hash som
  // leietakerkommentarene, men med sammensatt nøkkel "<leietaker>||<linjenøkkel>" - da trengs
  // verken ny hash, nytt API eller ny backup-rute, og kommentarene følger med i eksporten.
  function detaljRad(key: string, navn: string, tittel: string, fakturert?: number, gjenstar?: number, budsjett?: number) {
    const kommentarNokkel = `${row.navn}||${key}`;
    return (
      <tr key={key} className="bg-surface-1">
        <td className={navnCelle} title={tittel}>
          {navn}
        </td>
        {harStartSluttKolonne && <td className="px-3 py-1" />}
        <td className={celle}>{fakturert === undefined ? "" : formatKr(fakturert)}</td>
        <td className={celle}>{gjenstar === undefined ? "" : formatKr(gjenstar)}</td>
        <td className={celle}>{budsjett === undefined ? "" : formatKr(budsjett)}</td>
        <td className="px-3 py-1" />
        {harKommentarKolonne && (
          <td className="px-3 py-0.5" onClick={(e) => e.stopPropagation()}>
            <KommentarCell
              navn={kommentarNokkel}
              value={kommentarer?.[kommentarNokkel.trim().toLowerCase()] ?? ""}
              onSave={onSaveKommentar ?? (() => {})}
            />
          </td>
        )}
      </tr>
    );
  }

  const rader: React.ReactNode[] = [];

  if (erLedigRad) {
    for (const [i, l] of row.linjer.entries()) {
      // beskrivelse er "objekt — kommentar" slått sammen i build-tenant-forecast-table.js, mens
      // budsjettKommentar har kommentaren alene. Splittes igjen så objekt og kommentar får hver sin
      // kolonne, i stedet for én lang tekst der beløpet havner et tilfeldig sted.
      const kommentar = l.budsjettKommentar ?? "";
      const objekt =
        kommentar && l.beskrivelse.endsWith(kommentar)
          ? l.beskrivelse.slice(0, -kommentar.length).replace(/\s*[—-]\s*$/, "")
          : l.beskrivelse;
      const navn = `${objekt}${l.linjetype ? ` (${l.linjetype})` : ""}`;
      rader.push(detaljRad(`ledig-${i}`, navn, navn, undefined, undefined, l.fullArsverdi2026));
    }
  } else {
    for (const [i, k] of kontoer.entries()) {
      const navn = `${k.konto}${KONTONAVN[String(k.konto)] ? ` ${KONTONAVN[String(k.konto)]}` : ""}`;
      rader.push(
        detaljRad(
          `konto-${k.konto}`,
          navn,
          navn,
          k.belop,
          undefined,
          i === budsjettPaKontoIndeks && row.budsjett !== null ? row.budsjett : undefined,
        ),
      );
    }
    if (Math.round(row.gjenstar) !== 0) {
      for (const [i, l] of row.linjer.entries()) {
        const navn = `${l.bygg ? `${l.bygg} — ` : ""}${l.beskrivelse}`;
        rader.push(detaljRad(`linje-${i}`, navn, navn, undefined, l.gjenstarShare ?? l.fullArsverdi2026));
      }
    }
  }

  return (
    <>
      {rader}
      {flyttetInn.length > 0 && (
        <tr className="bg-surface-1">
          <td colSpan={antallKolonner} className="px-3 pt-1.5 text-2xs font-medium text-ink-3">
            Flyttet inn her <span className="font-normal text-ink-4">— budsjettet under er beløpet trukket ut over</span>
          </td>
        </tr>
      )}
      {flyttetInn.map((t) => (
        <tr key={`inn-${t.navn}`} className="bg-surface-1">
          <td className={navnCelle} title={t.navn}>
            {t.navn}
          </td>
          {harStartSluttKolonne && <td className="px-3 py-1" />}
          <td className={celle}>{formatKr(t.fakturert)}</td>
          <td className={celle}>{formatKr(t.gjenstar)}</td>
          <td className={celle}>{formatKr(t.budsjett ?? 0)}</td>
          <td
            className={`whitespace-nowrap px-3 py-1 text-right text-2xs tabular-nums ${
              t.avvik === null ? "text-ink-4" : t.avvik >= 0 ? "text-status-positive" : "text-status-danger"
            }`}
          >
            {t.avvik === null ? "—" : formatKr(t.avvik, true)}
          </td>
          {harKommentarKolonne && <td className="px-3 py-1" />}
        </tr>
      ))}
      {/* v42: den lange auto-kommentaren ("Utleid/trukket ut fra denne Ledig-raden (samlet ...)")
          er fjernet - den gjentok i prosa nøyaktig det tabellen over viser linje for linje. */}
    </>
  );
}


// Finner om noen av leietakerens kontraktslinjer starter og/eller slutter i 2026 - varsler om
// dette direkte i tabellen (Morten, 2026-08-26) siden det ofte forklarer hvorfor fakturert/
// gjenstår ser rart ut (kontrakten dekker bare en DEL av året). Tar tidligste start og seneste
// slutt blant linjer som faktisk faller innenfor 2026 - representerer leietakerens "inn"/"ut"-
// tidspunkt for de fleste tilfeller (én hovedlinje pr. leietaker+bygg er normalt).
// v2 (2026-08-29, Morten: AFRY-funn - "start 20.04 · slutt 31.03" så ut som en umulig,
// baklengs kontraktsperiode). Rotårsak: en leietaker med mange UAVHENGIGE linjer (typisk mange
// enkeltstående parkeringsplass-kontrakter, hver med egen historikk) fikk tidligere den TIDLIGSTE
// 2026-startdatoen og den SENESTE 2026-sluttdatoen plukket ut hver for seg, uansett om de kom fra
// SAMME linje - for AFRY Norway AS var det to helt urelaterte garasjeplasser (én sluttet 31.03,
// en helt annen startet 20.04), ikke én reell kontrakt med en baklengs periode. Sporer nå hvilken
// linje hver dato kom fra - `sammeLinje` er kun true når ÉN OG SAMME linje faktisk både startet
// OG sluttet i 2026 (en reell kort delårskontrakt), IKKE når datoene stammer fra ulike linjer.
function finn2026StartSlutt(
  linjer: { startDato: string | null; sluttDato: string | null }[],
): { start: string | null; slutt: string | null; sammeLinje: boolean } {
  let start: string | null = null;
  let startLinje: (typeof linjer)[number] | null = null;
  let slutt: string | null = null;
  let sluttLinje: (typeof linjer)[number] | null = null;
  for (const l of linjer) {
    if (l.startDato && l.startDato >= `${PROGNOSE_AR}-01-01` && l.startDato <= `${PROGNOSE_AR}-12-31`) {
      if (!start || l.startDato < start) {
        start = l.startDato;
        startLinje = l;
      }
    }
    if (l.sluttDato && l.sluttDato >= `${PROGNOSE_AR}-01-01` && l.sluttDato <= `${PROGNOSE_AR}-12-31`) {
      if (!slutt || l.sluttDato > slutt) {
        slutt = l.sluttDato;
        sluttLinje = l;
      }
    }
  }
  return { start, slutt, sammeLinje: startLinje !== null && startLinje === sluttLinje };
}

function formatDagManed(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

// Kommentarer kan bli lange (frie forklaringer, se lib/tenantForecastComments.ts) - en enkel
// ensrads-input klipper teksten. Klikk åpner en Popover med full tekst i en tekstboks, fortsatt
// redigerbar (lagrer ved blur), i stedet for kun en synlig ensrads-visning (Morten, 2026-08-27).
// v53: `fraClaude` = kommentaren er skrevet av Claude (analyseforklaring), ikke av Morten. Vises i
// accent-farge og kursiv slik at de to aldri kan forveksles. Redigerer Morten en Claude-kommentar,
// lagres den uten forfatter og blir hans - da skifter den farge tilbake.
function KommentarCell({
  navn,
  value,
  onSave,
  fraClaude = false,
}: {
  navn: string;
  value: string;
  onSave: (navn: string, value: string) => void;
  fraClaude?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && draft !== value) onSave(navn, draft);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(value);
            }}
            className={`block w-full max-w-[180px] truncate rounded-md border border-transparent px-1.5 py-1 text-left text-2xs outline-none transition hover:border-line hover:bg-surface-2 ${
              fraClaude ? "italic text-accent" : "text-ink-2"
            }`}
            title={fraClaude ? "Forklaring skrevet av Claude - rediger for å gjøre den til din" : undefined}
          >
            {value || <span className="text-ink-4">Kommentar…</span>}
          </button>
        }
      />
      <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-4">{navn}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(navn, draft);
          }}
          placeholder="Skriv en kommentar…"
          rows={5}
          autoFocus
          className="w-full resize-none rounded-md border border-line bg-surface-2 p-2 text-sm text-ink-1 outline-none focus:border-line-strong"
        />
      </PopoverContent>
    </Popover>
  );
}

type LedigeLokalerSortKey = "navn" | "opprinnelig" | "koblet" | "forventet" | "nullet";

// Fargekoding for de tre tilstandene en budsjettert Ledig-krone kan være i - gjenbrukt i
// sammendragsstripen, pr.-bygg-stolpen og gruppeoverskriftene, så de aldri glir fra hverandre.
const LEDIG_FARGE = {
  koblet: "text-status-positive",
  forventet: "text-status-warning",
  nullet: "text-status-danger",
} as const;
// Gjenværende Ledig-linjer fra og med dette beløpet får budsjettets egen kommentar vist i klartekst
// (Morten 2026-09-06) - under terskelen ligger den bare i hover-teksten.
const LEDIG_KOMMENTAR_TERSKEL = 100_000;

function LedigStolpe({ koblet, forventet, nullet, total }: { koblet: number; forventet: number; nullet: number; total: number }) {
  if (total <= 0) return null;
  const pct = (n: number) => `${(Math.max(0, n) / total) * 100}%`;
  return (
    <span className="flex h-1 w-full gap-px overflow-hidden rounded-full bg-ink-4/25" role="img" aria-label="Koblet / forventet / nullet">
      {koblet > 0 && <span className={`${LEDIG_FARGE.koblet} block h-full bg-current`} style={{ width: pct(koblet) }} />}
      {forventet > 0 && <span className={`${LEDIG_FARGE.forventet} block h-full bg-current`} style={{ width: pct(forventet) }} />}
      {nullet > 0 && <span className={`${LEDIG_FARGE.nullet} block h-full bg-current`} style={{ width: pct(nullet) }} />}
    </span>
  );
}

function LedigGruppeTittel({ tittel, belop, colorClass }: { tittel: string; belop: number; colorClass: string }) {
  return (
    <p className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.13em] ${colorClass}`}>
      <span>{tittel}</span>
      <span className="h-px flex-1 bg-current opacity-30" aria-hidden />
      <span className="tabular-nums">{formatKr(belop)}</span>
    </p>
  );
}

// Dedikert oversikt over "Ledig <kortkode>"-radene (Morten, 2026-08-29) - i TILLEGG til (ikke
// erstatning for) at de samme radene/leietakerne fortsatt vises som normalt i Leieinntekter-
// tabellen over. Leser samme delA.leietaker-array, ingen egen Redis-pipeline.
// v2 (2026-09-06): hver Ledig-krone plasseres i én av tre grupper pr. bygg - koblet (linjen er
// tatt av en navngitt leietaker/internleie, budsjettet flyttet dit), forventet (Finance forventer
// fortsatt utleie i år) eller nullet (Finance har tatt beløpet ut av prognosen). Finance sin
// siste månedskommentar vises pr. gjenværende linje. Se kobleFlyttetInnOgTrekkFra() i
// scripts/build-tenant-forecast-table.js for hvordan feltene settes.
// v17 (2026-09-07): `vacantKvm` er totalLedigKvm fra VacantAreasSnapshot (Fazile arealoversikt,
// Tillegg-fanen) - en HELT uavhengig datakilde fra denne blokkens kr-tall (tenantForecastTable).
// De to har aldri vært vist sammen eller kryssjekket mot hverandre (se controller-gjennomgangen
// 2026-09-07: "ledighet vises som kvm ett sted og kr et annet sted uten kobling"). Viser dem side
// om side her, ikke en full sammenslåing av datamodellene - de to kildene har ulik bygg-matching
// og granularitet, en fullstendig kobling er en egen jobb.
function LedigeLokalerBlock({ rows, vacantKvm }: { rows: TenantForecastRow[]; vacantKvm: number | null }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Ledige lokaler", true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [commentOverrides, setCommentOverrides] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: LedigeLokalerSortKey; dir: 1 | -1 }>({ key: "opprinnelig", dir: -1 });

  // v51: linjekommentarene finnes ikke i tabell-snapshotet (sammensatt nøkkel), så hele
  // kommentarkartet hentes én gang og legges i samme override-objekt som redigeringene bruker.
  useEffect(() => {
    fetch("/api/income-forecast/tenant-comments")
      .then((r) => r.json())
      .then((d) => setCommentOverrides((prev) => ({ ...(d.kommentarer ?? {}), ...prev })))
      .catch(() => {});
  }, []);

  async function saveComment(navn: string, kommentar: string) {
    setCommentOverrides((prev) => ({ ...prev, [navn.trim().toLowerCase()]: kommentar, [navn]: kommentar }));
    try {
      await fetch("/api/income-forecast/tenant-comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navn, kommentar }),
      });
    } catch {
      /* lagring feilet stille - kommentaren vises fortsatt lokalt til neste sideoppdatering */
    }
  }

  const rowByNavn = useMemo(() => new Map(rows.map((r) => [r.navn, r])), [rows]);
  const flyttetInnByLedigNavn = useMemo(() => {
    const m = new Map<string, TenantForecastRow[]>();
    for (const r of rows) {
      if (!r.flyttetInnI) continue;
      if (!m.has(r.flyttetInnI)) m.set(r.flyttetInnI, []);
      m.get(r.flyttetInnI)!.push(r);
    }
    return m;
  }, [rows]);

  const derivedAll = useMemo(
    () =>
      rows
        .filter((r) => r.navn.startsWith("Ledig"))
        .map((row) => {
          const poster = row.ledigPoster ?? [];
          const posterNavn = new Set(poster.filter((p) => p.type === "leietaker").map((p) => p.navn));
          // Leietakere nestet under raden uten egen budsjettlinje (strengformen i overrides) -
          // inntekten deres er ren oppside mot budsjett, vises under "Koblet" med 0 i budsjett.
          const utenLinje = (flyttetInnByLedigNavn.get(row.navn) ?? []).filter((t) => !posterNavn.has(t.navn));
          const nulletLinjer = row.linjer.filter((l) => l.ledigVurdering === "nullet");
          const forventetLinjer = row.linjer.filter((l) => l.ledigVurdering !== "nullet");
          const koblet = row.ledigTrukketUt ?? 0;
          const forventet = forventetLinjer.reduce((s, l) => s + l.fullArsverdi2026, 0);
          const nullet = nulletLinjer.reduce((s, l) => s + l.fullArsverdi2026, 0);
          return {
            row,
            poster,
            utenLinje,
            forventetLinjer,
            nulletLinjer,
            opprinnelig: row.ledigOpprinneligBudsjett ?? row.budsjett ?? 0,
            koblet,
            forventet,
            nullet,
            sokeTekst: [row.navn, ...poster.map((p) => p.navn), ...utenLinje.map((t) => t.navn), ...row.linjer.map((l) => l.beskrivelse)].join(" ").toLowerCase(),
          };
        }),
    [rows, flyttetInnByLedigNavn],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? derivedAll.filter((d) => d.sokeTekst.includes(q)) : derivedAll;
  }, [derivedAll, search]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => (key === "navn" ? a.row.navn.localeCompare(b.row.navn, "nb-NO") * dir : (a[key] - b[key]) * dir));
  }, [filtered, sort]);

  function toggle(navn: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(navn)) next.delete(navn);
      else next.add(navn);
      return next;
    });
  }

  function sortKnapp(label: string, key: LedigeLokalerSortKey) {
    const active = sort.key === key;
    return (
      <button
        type="button"
        onClick={() => setSort((prev) => (prev.key === key ? { key, dir: (prev.dir * -1) as 1 | -1 } : { key, dir: key === "navn" ? 1 : -1 }))}
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-2xs font-medium transition hover:text-ink-1 ${active ? "bg-surface-2 text-ink-1" : "text-ink-4"}`}
      >
        {label}
        {active && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    );
  }

  const total = {
    opprinnelig: derivedAll.reduce((s, d) => s + d.opprinnelig, 0),
    koblet: derivedAll.reduce((s, d) => s + d.koblet, 0),
    forventet: derivedAll.reduce((s, d) => s + d.forventet, 0),
    nullet: derivedAll.reduce((s, d) => s + d.nullet, 0),
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Ledige lokaler"
        // v28 (2026-09-08): hadde KUN `stat`, som CardHeader skjuler når kortet er kollapset
        // (`showStat = stat && !collapsed`). Siden kortet er kollapset som default var dette den
        // eneste seksjonen på Prognose-fanen uten beløp i headeren - og nettopp den som forklarer
        // −6,4 mill av avviket mot budsjett. Naboseksjonene bruker subtitle+alwaysShowSubtitle;
        // det gjør denne nå også. v50: Morten ville ha headeren helt uten beløp (2026-09-11) -
        // tallet står i Ledig-radene i Leieinntekter og i toppboksens waterfall.
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={DoorOpen}
        iconColorClass="text-status-warning"
      />
      {!collapsed && (
        <>
          {vacantKvm !== null && vacantKvm > 0 && (
            <p className="flex items-center gap-1 text-2xs text-ink-4">
              {vacantKvm.toLocaleString("nb-NO")} kvm ledig areal i &quot;Ledige arealer&quot; (Tillegg-fanen)
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label="Om kryssreferansen mot kvm" className="shrink-0 text-ink-4 hover:text-ink-1">
                      <Info className="h-3 w-3" />
                    </button>
                  }
                />
                <TooltipContent>
                  Fazile arealoversikt, uavhengig av tallene under. ≈{" "}
                  {formatKr(Math.round((total.forventet + total.nullet) / vacantKvm))}/kvm/år av gjenstående budsjett under - to
                  uavhengige kilder, ikke slått sammen.
                </TooltipContent>
              </Tooltip>
            </p>
          )}
          {/* Sammendragsstripe: hvor de opprinnelig budsjetterte ledig-kronene har havnet. */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-1 px-3 py-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
              {(
                [
                  ["Budsjettert ledig", total.opprinnelig, "text-ink-2"],
                  ["Koblet til leietaker", total.koblet, LEDIG_FARGE.koblet],
                  ["Forventet utleid", total.forventet, LEDIG_FARGE.forventet],
                  ["Nullet av Finance", total.nullet, LEDIG_FARGE.nullet],
                ] as const
              ).map(([label, belop, color]) => (
                <div key={label} className="flex flex-col">
                  <span className="text-2xs uppercase tracking-wide text-ink-4">{label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${color}`}>{formatKr(belop)}</span>
                </div>
              ))}
            </div>
            <LedigStolpe koblet={total.koblet} forventet={total.forventet} nullet={total.nullet} total={total.opprinnelig} />
            <p className="text-2xs text-ink-4">
              Koblet = Ledig-linjen er tatt av en navngitt leietaker eller internleie, og budsjettet er flyttet til den raden i Leieinntekter.
              Forventet/nullet er Finance sin egen vurdering av de linjene som fortsatt står ledig (juli-prognosen).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk bygg, leietaker eller areal…"
                className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
              />
            </div>
            <div className="flex items-center gap-0.5">
              <span className="mr-1 text-2xs text-ink-4">Sorter:</span>
              {sortKnapp("Bygg", "navn")}
              {sortKnapp("Budsjett", "opprinnelig")}
              {sortKnapp("Koblet", "koblet")}
              {sortKnapp("Forventet", "forventet")}
              {sortKnapp("Nullet", "nullet")}
            </div>
          </div>
          {derivedAll.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen ledige lokaler i denne kategorien.</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen treff.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sorted.map((d) => {
                const isOpen = expanded.has(d.row.navn);
                const gjenstaende = d.forventet + d.nullet;
                return (
                  <div key={d.row.navn} className="rounded-lg border border-line bg-surface-1">
                    <button type="button" onClick={() => toggle(d.row.navn)} className="flex w-full flex-col gap-1.5 px-3 py-2 text-left">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{d.row.navn}</span>
                        <span className="shrink-0 text-2xs tabular-nums text-ink-4">{formatKr(d.opprinnelig)} budsjettert</span>
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-ink-4" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-4" />}
                      </div>
                      <LedigStolpe koblet={d.koblet} forventet={d.forventet} nullet={d.nullet} total={d.opprinnelig} />
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums">
                        <span className={LEDIG_FARGE.koblet}>{formatKr(d.koblet)} koblet</span>
                        <span className={LEDIG_FARGE.forventet}>{formatKr(d.forventet)} forventet</span>
                        <span className={LEDIG_FARGE.nullet}>{formatKr(d.nullet)} nullet</span>
                        <span className="text-ink-4">= {formatKr(gjenstaende)} gjenstår</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-3 border-t border-line px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <LedigGruppeTittel tittel="Utleid (koblet)" belop={d.koblet} colorClass={LEDIG_FARGE.koblet} />
                          {d.poster.length === 0 && d.utenLinje.length === 0 ? (
                            <p className="text-2xs text-ink-4">Ingen linjer er koblet til en leietaker ennå.</p>
                          ) : (
                            <>
                              {d.poster.map((p) => {
                                const leietaker = p.type === "leietaker" ? rowByNavn.get(p.navn) : undefined;
                                const faktisk = leietaker ? leietaker.fakturert + leietaker.gjenstar : null;
                                // v16 match-kvalitet (2026-09-07): denne visningen slo opp samme leietaker-
                                // rad uten selv å vise noe om koblingen kan være fuzzy (samme gap som
                                // KontrakterPaUtlopBlock hadde).
                                const matchVarsel = leietaker ? matchKvalitetTekst(leietaker) : null;
                                return (
                                  <div key={`${p.type}-${p.navn}`} className="flex items-baseline justify-between gap-2 text-2xs">
                                    <span className="flex min-w-0 items-center gap-1 text-ink-2">
                                      <span className="truncate">{p.navn}</span>
                                      {p.type !== "leietaker" && (
                                        <span className="shrink-0 rounded bg-surface-2 px-1 py-px text-[9px] uppercase tracking-wide text-ink-4">
                                          {p.type === "intern" ? "internleie" : "dobbeltbudsjettert"}
                                        </span>
                                      )}
                                      {p.beskrivelse && (
                                        <Tooltip>
                                          <TooltipTrigger render={<Info className="h-3 w-3 shrink-0 text-ink-4" />} />
                                          <TooltipContent className="max-w-xs">{p.beskrivelse}</TooltipContent>
                                        </Tooltip>
                                      )}
                                      {matchVarsel && (
                                        <Tooltip>
                                          <TooltipTrigger
                                            render={
                                              <button type="button" aria-label="Usikker kobling" className="shrink-0 text-status-warning hover:text-status-warning/80">
                                                <AlertTriangle className="h-3 w-3" />
                                              </button>
                                            }
                                          />
                                          <TooltipContent className="max-w-xs">{matchVarsel}</TooltipContent>
                                        </Tooltip>
                                      )}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-ink-3">
                                      {formatKr(p.belop)}
                                      {faktisk !== null && leietaker && (
                                        <span className={`ml-2 ${(leietaker.avvik ?? 0) >= 0 ? "text-status-positive" : "text-status-danger"}`}>
                                          faktisk {formatKr(faktisk)} ({formatKr(leietaker.avvik ?? 0, true)})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                              {d.utenLinje.map((t) => (
                                <div key={t.navn} className="flex items-baseline justify-between gap-2 text-2xs">
                                  <span className="flex min-w-0 items-center gap-1 text-ink-2">
                                    <span className="truncate">{t.navn}</span>
                                    <span className="shrink-0 rounded bg-surface-2 px-1 py-px text-[9px] uppercase tracking-wide text-ink-4">uten budsjettlinje</span>
                                  </span>
                                  <span className="shrink-0 tabular-nums text-ink-3">
                                    0<span className="ml-2 text-status-positive">faktisk {formatKr(t.fakturert + t.gjenstar)}</span>
                                  </span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                        {(
                          [
                            ["Forventet utleid, ikke leid ut ennå", d.forventetLinjer, d.forventet, LEDIG_FARGE.forventet],
                            ["Ledig ut året / nullet av Finance", d.nulletLinjer, d.nullet, LEDIG_FARGE.nullet],
                          ] as const
                        ).map(([tittel, linjer, belop, color]) =>
                          linjer.length === 0 ? null : (
                            <div key={tittel} className="flex flex-col gap-1">
                              <LedigGruppeTittel tittel={tittel} belop={belop} colorClass={color} />
                              {linjer.map((l, i) => {
                                // beskrivelse = "objekt — budsjettkommentar"; vis objektet på linjen og
                                // kommentaren for seg der den betyr noe (Morten 2026-09-06: over 100 000 kr
                                // vil han se hva som var budsjettert utleid men ikke ble det).
                                const suffiks = l.budsjettKommentar ? ` — ${l.budsjettKommentar}` : "";
                                const objekt = suffiks && l.beskrivelse.endsWith(suffiks) ? l.beskrivelse.slice(0, -suffiks.length) : l.beskrivelse;
                                const stor = l.fullArsverdi2026 >= LEDIG_KOMMENTAR_TERSKEL;
                                return (
                                  <div key={`${l.beskrivelse}-${i}`} className="flex flex-col gap-0.5 text-2xs">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="min-w-0 truncate text-ink-2" title={l.beskrivelse}>
                                        {objekt}
                                      </span>
                                      <span className="shrink-0 tabular-nums text-ink-3">
                                        {formatKr(l.fullArsverdi2026)}
                                        {l.financeEndring !== undefined && l.financeEndring !== 0 && (
                                          <span className={`ml-2 ${l.financeEndring > 0 ? "text-status-positive" : "text-status-danger"}`}>
                                            Finance {formatKr(l.financeEndring, true)}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    {stor && l.budsjettKommentar && (
                                      <p className={`border-l-2 pl-2 ${color} border-current/40`}>
                                        <span className="text-ink-4">Budsjettert: </span>
                                        <span className="text-ink-2">{l.budsjettKommentar}</span>
                                      </p>
                                    )}
                                    {l.financeKommentar && <p className="pl-2 text-ink-4">Finance {l.financeKommentar}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          ),
                        )}
                        <div className="flex items-center gap-2 border-t border-line pt-2">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-ink-4" />
                          <KommentarCell navn={d.row.navn} value={commentOverrides[d.row.navn] ?? d.row.kommentar ?? ""} onSave={saveComment} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type KontraktUtlopSortKey = "leietaker" | "fakturert" | "gjenstar" | "budsjett" | "avvik" | "ekstraVedReforhandling";

// Ny seksjon (Morten, 2026-08-29): "samme kolonner som leietakerlisten" + mulighet til å sette
// sannsynlighet for reforhandling PR. KONTRAKT, med en potensiell-eksponering-sum som endrer seg
// live basert på valgene. Gjenbruker ALT eksisterende datagrunnlag (ContractExpiry2026Snapshot,
// TenantSignal, TenantForecastRow) - ingen ny pipeline, ingen nytt API. Den eldre, mer detaljerte
// "Kontrakter som utløper i 2026"-seksjonen i Tillegg-fanen (ContractExpiry2026Block) er
// UBERØRT - dette er en tilleggsvisning, ikke en erstatning.
function KontrakterPaUtlopBlock({
  snapshot,
  loading,
  signals,
  onSignalUpdated,
  leietakerRader,
}: {
  snapshot: ContractExpiry2026Snapshot | null;
  loading: boolean;
  signals: TenantSignal[];
  onSignalUpdated: (next: TenantSignal) => void;
  leietakerRader: TenantForecastRow[];
}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Kontrakter på utløp", true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: KontraktUtlopSortKey; dir: 1 | -1 }>({ key: "ekstraVedReforhandling", dir: -1 });

  const signalsById = useMemo(() => new Map(signals.map((s) => [s.id, s])), [signals]);
  // Case-insensitiv navnematch mot leietakerlisten - samme Fazile/REMAINING-kilde begge steder,
  // men faller trygt tilbake til "—" i UI-en hvis en leietaker mot formodning ikke skulle finnes.
  const leietakerByNavn = useMemo(() => new Map(leietakerRader.map((r) => [r.navn.trim().toLowerCase(), r])), [leietakerRader]);

  const apneKontrakter = useMemo(() => (snapshot ? snapshot.contracts.filter((c) => c.status === "apen") : []), [snapshot]);

  // Summert PR. LEIETAKER (ikke pr. kontrakt) - samme Map som Leieinntekter-tabellen bruker, slik
  // at Gjenstår/+/- her ALLTID stemmer overens med det Leieinntekter viser for samme leietaker,
  // også når en leietaker har flere åpne kontrakter som utløper i 2026.
  const ekstraVedReforhandlingByNavn = useMemo(() => beregnEkstraVedReforhandlingByNavn(snapshot, signals), [snapshot, signals]);

  const derivedAll = useMemo(
    () =>
      apneKontrakter.map((kontrakt) => {
        const tenantRow = leietakerByNavn.get(kontrakt.leietaker.trim().toLowerCase());
        const signal = signalsById.get(kontrakt.kontraktsnokkel);
        // v9 (2026-08-29): RETTET - Morten var ute etter "ekstra inntekt resten av 2026 hvis
        // reforhandlet til samme vilkår" (kontrakt.ekstraI2026 - dagsprorata fra utløpsdato til
        // 31.12.2026), IKKE full årsleie vektet mot risikoen for IKKE å reforhandle (det jeg
        // bygde først). Default sannsynlighet er 100 % (ikke 0 %) når ingen signal er satt ennå -
        // matcher den eksisterende, ikke-vektede `totalEkstraI2026` (som antar ALLE reforhandles)
        // som naturlig startpunkt/referanse ("det var tidligere 32 mnok").
        const sannsynlighet = signal?.sannsynlighetProsent ?? 100;
        // Vis 100 % som en synlig, redigerbar verdi fra start (ikke en "Sett sannsynlighet"-
        // knapp som skjuler default-antagelsen) - Morten (2026-08-29): "prosentsatsen [må] vise
        // og at man kan justere den". Kun til VISNING - selve lagringen (onSignalUpdated) bruker
        // fortsatt fallbackNavn/fallbackBygg/type til å opprette et ekte signal ved første lagring.
        const visSignal: TenantSignal =
          signal ??
          ({
            id: kontrakt.kontraktsnokkel,
            type: "reforhandling",
            navn: kontrakt.leietaker,
            bygg: kontrakt.bygg,
            sannsynlighetProsent: 100,
            notat: "",
            kilde: "Standard (ingen vurdering satt ennå)",
            sistOppdatert: "",
          } satisfies TenantSignal);
        const ekstraVedReforhandling = Math.round(kontrakt.ekstraI2026 * (sannsynlighet / 100) * 100) / 100;
        // Morten (2026-08-29): Gjenstår/+/- hentet rått fra Leieinntekter forutsetter at
        // leieforholdet bare tar slutt på kontraktens utløpsdato - ved 100 % sannsynlighet for
        // reforhandling skal "gjenstår å fakturere" i stedet reflekte at fakturering fortsetter
        // resten av året til samme sats. Legger derfor til leietakerens SAMLEDE
        // ekstraVedReforhandling (summert over ev. flere åpne kontrakter, samme Map som
        // Leieinntekter-tabellen bruker - IKKE bare denne ene kontraktens egen verdi) i
        // gjenstår, slik at +/- går mot ~0 når sannsynligheten er høy OG stemmer eksakt overens
        // med tallet Leieinntekter viser for samme leietaker (Morten 2026-08-29: "det man velger
        // under kontrakter på utløp reflekteres fortsatt ikke opp i leieinntekter").
        const ekstraVedReforhandlingTenantTotal = ekstraVedReforhandlingByNavn.get(kontrakt.leietaker.trim().toLowerCase()) ?? 0;
        const gjenstar = tenantRow ? Math.round((tenantRow.gjenstar + ekstraVedReforhandlingTenantTotal) * 100) / 100 : null;
        const avvik = tenantRow && tenantRow.budsjett !== null ? Math.round((tenantRow.fakturert + gjenstar! - tenantRow.budsjett) * 100) / 100 : null;
        // v2 (2026-08-29, Morten: "tenk som en inntektskontroller") - to uavhengige varsler:
        // (1) avviket forblir stort selv ved den sannsynligheten som faktisk er valgt - noe
        // stemmer trolig ikke i budsjett-/kontraktsdataen for denne (se ContractExpiryDetails-
        // drilldown for detaljer); (2) leietakeren har allerede fakturert mer enn kontraktens
        // egen sluttdato skulle tilsi (beregnet server-side i build-contract-expiry-2026.js,
        // se kontrakt.muligAlleredeDekket) - ekstraVedReforhandling kan da dobbeltelle en
        // allerede realisert engangs-/dobbel-kvartal-betaling (bekreftet mønster hos en
        // CC Vest-butikk, se minnenotat).
        const storAvvikSelvJustert = avvik !== null && tenantRow?.budsjett && Math.abs(avvik) > tenantRow.budsjett * 0.1 && Math.abs(avvik) > 50000;
        const varsler = [
          storAvvikSelvJustert ? `Stort avvik (${formatKr(avvik!, true)}) selv med valgt sannsynlighet - budsjett/kontraktsdata bør sjekkes.` : null,
          kontrakt.muligAlleredeDekket
            ? `Allerede fakturert ${formatKr(kontrakt.muligAlleredeDekket.faktiskFakturert)} i bygget - ${formatKr(kontrakt.muligAlleredeDekket.overskudd)} mer enn kontraktens sluttdato skulle tilsi. "Ekstra ved reforhandling" kan dobbeltelle dette.`
            : null,
          // v16 match-kvalitet (2026-09-07): denne visningen slår opp samme leietaker-rad som
          // Leieinntekter-tabellen, uten selv å vise noe om at koblingen kan være fuzzy - en stor,
          // usikkert koblet leietaker så like troverdig ut her som en sikker kundenummer-match.
          tenantRow ? matchKvalitetTekst(tenantRow) : null,
        ].filter((v): v is string => v !== null);
        return {
          kontrakt,
          signal,
          visSignal,
          tenantRow,
          fakturert: tenantRow?.fakturert ?? null,
          gjenstar,
          budsjett: tenantRow?.budsjett ?? null,
          avvik,
          ekstraVedReforhandling,
          varsler,
        };
      }),
    [apneKontrakter, leietakerByNavn, signalsById, ekstraVedReforhandlingByNavn],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return derivedAll;
    return derivedAll.filter((d) => d.kontrakt.leietaker.toLowerCase().includes(q) || d.kontrakt.bygg.toLowerCase().includes(q));
  }, [derivedAll, search]);

  function toggleSort(key: KontraktUtlopSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: (prev.dir * -1) as 1 | -1 } : { key, dir: key === "leietaker" ? 1 : -1 }));
  }

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      if (key === "leietaker") return a.kontrakt.leietaker.localeCompare(b.kontrakt.leietaker, "nb-NO") * dir;
      const av = a[key];
      const bv = b[key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [filtered, sort]);

  const visible = sorted.slice(0, visibleCount);

  function toggle(kontraktsnokkel: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(kontraktsnokkel)) next.delete(kontraktsnokkel);
      else next.add(kontraktsnokkel);
      return next;
    });
  }

  function headerButton(label: string, key: KontraktUtlopSortKey) {
    const active = sort.key === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-0.5 text-2xs font-medium transition hover:text-ink-1 ${active ? "text-ink-1" : "text-ink-4"}`}
      >
        {label}
        {active && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    );
  }

  // Samme delte funksjon som MainForecastBox (toppboksen) bruker - garanterer at de to alltid
  // viser identisk tall, i stedet for to uavhengige utregninger som kan drifte fra hverandre.
  const totalEkstraVektet = beregnVektetReforhandlingTotal(snapshot, signals);

  return (
    <div id="kontrakter-pa-utlop" className="flex scroll-mt-4 flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Kontrakter på utløp"
        // v28 (2026-09-08): headeren viste FULLT potensial (totalEkstraI2026) mens toppboksens
        // waterfall viste "Reforhandling (vektet)" - to ulike tall for samme begrep synlig
        // samtidig på skjermen, uten at noe sa hva forskjellen var. Nå vises det VEKTEDE tallet,
        // altså det som faktisk inngår i prognosen.
        // v29: kortet ned fra "X vektet · Y fullt potensial" - undertittelen ble dobbelt så lang
        // som naboseksjonenes og brøt beløpskolonnen til høyre. Fullt potensial står allerede i
        // toppboksens tooltip og inne i selve seksjonen. v50: kun beløpet (Morten 2026-09-11).
        subtitle={snapshot ? formatKr(totalEkstraVektet) : "Laster…"}
        alwaysShowSubtitle
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={CalendarClock}
        iconColorClass="text-status-warning"
      />
      {!collapsed && (
        <>
          {snapshot && (
            <p className="text-2xs text-ink-3">
              {formatKr(totalEkstraVektet)} ekstra inntekt hvis reforhandlet (av {formatKr(snapshot.totalEkstraI2026)}{" "}
              hvis alt reforhandles til samme vilkår)
            </p>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(20);
              }}
              placeholder="Søk leietaker eller bygg…"
              className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
            />
          </div>
          {loading ? (
            <SkeletonRows count={4} />
          ) : apneKontrakter.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen åpne kontrakter utløper i {snapshot ? snapshot.ar : PROGNOSE_AR}.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="text-left text-ink-4">
                    <th className="px-3 py-2">{headerButton("Leietaker", "leietaker")}</th>
                    <th className="px-3 py-2 text-left text-2xs font-medium text-ink-4">Bygg</th>
                    <th className="px-3 py-2 text-left text-2xs font-medium text-ink-4">Utløp</th>
                    <th className="px-3 py-2 text-right">{headerButton("Fakturert", "fakturert")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("Gjenstår", "gjenstar")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("Budsjett", "budsjett")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("+/-", "avvik")}</th>
                    <th className="px-3 py-2 text-left">Sannsynlighet reforhandling</th>
                    <th className="px-3 py-2 text-right">{headerButton("Ekstra ved reforhandling", "ekstraVedReforhandling")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => {
                    const isOpen = expanded.has(d.kontrakt.kontraktsnokkel);
                    const utlop =
                      d.kontrakt.minSlutt === d.kontrakt.maxSlutt
                        ? formatDateDMY(d.kontrakt.maxSlutt)
                        : `${formatDateDMY(d.kontrakt.minSlutt)}–${formatDateDMY(d.kontrakt.maxSlutt)}`;
                    return (
                      <Fragment key={d.kontrakt.kontraktsnokkel}>
                        <tr
                          className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50"
                          onClick={() => toggle(d.kontrakt.kontraktsnokkel)}
                        >
                          <td className="max-w-[150px] px-3 py-2 text-ink-1">
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="truncate">{d.kontrakt.leietaker}</span>
                              {d.varsler.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <button
                                        type="button"
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label="Varsel"
                                        className="shrink-0 text-status-warning hover:text-status-warning/80"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </button>
                                    }
                                  />
                                  <TooltipContent className="max-w-xs">
                                    {d.varsler.map((v, i) => (
                                      <p key={i} className={i > 0 ? "mt-1" : ""}>
                                        {v}
                                      </p>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-2xs text-ink-3">{d.kontrakt.bygg}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-3">{utlop}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{d.fakturert == null ? "—" : formatKr(d.fakturert)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{d.gjenstar == null ? "—" : formatKr(d.gjenstar)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{d.budsjett == null ? "—" : formatKr(d.budsjett)}</td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                              d.avvik == null ? "text-ink-4" : d.avvik >= 0 ? "text-status-positive" : "text-status-danger"
                            }`}
                          >
                            {d.avvik == null ? "—" : formatKr(d.avvik, true)}
                          </td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <SignalEditor
                              id={d.kontrakt.kontraktsnokkel}
                              type="reforhandling"
                              signal={d.visSignal}
                              fallbackNavn={d.kontrakt.leietaker}
                              fallbackBygg={d.kontrakt.bygg}
                              onUpdated={onSignalUpdated}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-ink-1">{formatKr(d.ekstraVedReforhandling)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-line">
                            <td colSpan={9} className="bg-surface-1 p-3">
                              <ContractExpiryDetails contract={d.kontrakt} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong font-semibold">
                    <td className="px-3 py-2 text-ink-1" colSpan={7}>
                      Totalt ({derivedAll.length} åpne kontrakter)
                    </td>
                    <td className="px-3 py-2" />
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalEkstraVektet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {sorted.length > visible.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + 20)}
              className="mt-1 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              Vis {Math.min(20, sorted.length - visible.length)} til ({sorted.length - visible.length} gjenstår)
            </button>
          )}
        </>
      )}
    </div>
  );
}

// _reforhandlingsjustering er kun satt når raden fikk Gjenstår/+/- justert med
// reforhandlingByNavn (se TenantForecastTable) - brukes til å vise et infoikon i UI-en.
type DisplayTenantRow = TenantForecastRow & { _reforhandlingsjustering?: number };

// Delt mellom TenantForecastTable (Leieinntekter-tabellen) og StorstAvvikBlock/LedigeLokalerBlock
// (2026-09-07: de to sistnevnte viste tidligere UJUSTERTE avvik/gjenstår-tall for de samme
// radene tabellen viser JUSTERT - en leietaker med høy reforhandlingssannsynlighet kunne dermed
// se ut som et stort avvik i "Størst avvik mot budsjett", mens tabellen rett under viste nesten
// null). Samme "kopier tabellens egen pr.-rad-logikk"-prinsipp som v19 sin KpiStrip-fiks brukte
// for SUMMEN - dette er den generelle, per-rad varianten alle tre kan dele.
const REFORHANDLING_UPLASSERT_LABEL = "Ekstra ved reforhandling (uplassert)";

function applyReforhandlingJustering(rows: TenantForecastRow[], reforhandlingByNavn?: Map<string, number>): DisplayTenantRow[] {
  if (!reforhandlingByNavn || reforhandlingByNavn.size === 0) return rows;
  // v51: nøkler i Map-et som ikke matcher noen rad (f.eks. arealtype "El-bil plass" i Leietype-
  // fanen) samles i én egen rad, slik at Totalt-raden summerer til NØYAKTIG samme beløp i alle
  // tre grupperingene - det var hele poenget med fiksen.
  const radNokler = new Set(rows.map((r) => r.navn.trim().toLowerCase()));
  let uplassert = 0;
  for (const [key, belop] of reforhandlingByNavn) if (!radNokler.has(key)) uplassert += belop;
  const justerte = rows.map((r): DisplayTenantRow => {
    const justering = reforhandlingByNavn.get(r.navn.trim().toLowerCase());
    if (!justering) return r;
    const gjenstar = Math.round((r.gjenstar + justering) * 100) / 100;
    const avvik = r.budsjett !== null ? Math.round((r.fakturert + gjenstar - r.budsjett) * 100) / 100 : null;
    // Justeringen er et EKSTRA beløp pr. leietaker (ikke knyttet til én bestemt Fazile-linje) -
    // uten en synlig linje her ville drilldownen sin "Fazile-linje → Gjenstår"-sum (basert på
    // de ORIGINALE linjenes gjenstarShare) ikke stemt overens med raden sin egen, justerte
    // Gjenstår-verdi (Morten 2026-08-29 sitt "linjer/kontoer skal stemme"-krav gjelder også her).
    const linjer = [
      ...r.linjer,
      {
        eiendom: "",
        bygg: "",
        linjetype: "",
        beskrivelse: "Ekstra ved reforhandling (se Kontrakter på utløp)",
        del: "A" as const,
        fullArsverdi2026: 0,
        startDato: null,
        sluttDato: null,
        gjenstarShare: justering,
      },
    ];
    return { ...r, gjenstar, avvik, linjer, _reforhandlingsjustering: justering };
  });
  if (Math.abs(uplassert) < 1) return justerte;
  const beløp = Math.round(uplassert * 100) / 100;
  justerte.push({
    navn: REFORHANDLING_UPLASSERT_LABEL,
    fakturert: 0,
    gjenstar: beløp,
    budsjett: 0,
    avvik: beløp,
    linjer: [
      {
        eiendom: "",
        bygg: "",
        linjetype: "",
        beskrivelse: "Ekstra ved reforhandling (se Kontrakter på utløp)",
        del: "A" as const,
        fullArsverdi2026: 0,
        startDato: null,
        sluttDato: null,
        gjenstarShare: beløp,
      },
    ],
    _reforhandlingsjustering: beløp,
  });
  return justerte;
}

const GRUPPERING_LABEL: Record<TenantForecastGruppering, string> = { leietaker: "Leietaker", bygg: "Bygg", leietype: "Leietype" };
const GRUPPERINGER: TenantForecastGruppering[] = ["leietaker", "bygg", "leietype"];
const EMPTY_GRUPPER: TenantForecastGrupper = { leietaker: [], bygg: [], leietype: [] };

// v16 match-kvalitet (se row.nxtMatch/budsjettVia i lib/tenantForecastTable.ts): varsler når
// koblingen mellom Fazile, NXT og budsjett for en leietaker-rad hviler på en fuzzy-kobling i
// stedet for et sikkert kundenummer/eksakt navn, slik at en stor, fuzzy-koblet rad kan
// kontrolleres i stedet for å se like sikker ut som en vanlig match.
const NXT_MATCH_LABEL: Record<string, string> = {
  kundenr: "Kundenummer",
  "navn-eksakt": "Eksakt navn",
  alias: "Alias",
  "kjerne-navn": "Kjernenavn (fuzzy)",
  ingen: "Ingen NXT-kobling",
};
const NXT_MATCH_SIKKER = new Set(["kundenr", "navn-eksakt"]);
const BUDSJETT_VIA_LABEL: Record<string, string> = {
  eksakt: "Eksakt navn",
  alias: "Alias",
  "kjerne-navn": "Kjernenavn (fuzzy)",
  "bygg+beskrivelse": "Bygg + beskrivelse",
  delstreng: "Delstreng (fuzzy)",
  "kjerne-navn (tabell)": "Kjernenavn i tabell (fuzzy)",
  "uten treff": "Ingen budsjett-treff",
};
const BUDSJETT_VIA_SIKKER = new Set(["eksakt"]);

function matchKvalitetTekst(row: TenantForecastRow): string | null {
  const deler: string[] = [];
  if (row.nxtMatch && !NXT_MATCH_SIKKER.has(row.nxtMatch)) deler.push(`NXT: ${NXT_MATCH_LABEL[row.nxtMatch] ?? row.nxtMatch}`);
  if (row.budsjettVia?.some((v) => !BUDSJETT_VIA_SIKKER.has(v))) {
    deler.push(`Budsjett: ${row.budsjettVia.map((v) => BUDSJETT_VIA_LABEL[v] ?? v).join(" → ")}`);
  }
  if (row.excelNavn && row.excelNavn.length > 0) deler.push(`Excel-navn: ${row.excelNavn.join(", ")}`);
  if (row.remainingStatuser && row.remainingStatuser.length > 0) {
    deler.push(`Status: ${row.remainingStatuser.map(bygStatusLabel).join(", ")}`);
  }
  if (deler.length === 0) return null;
  return `Usikker kobling mellom kildene — ${deler.join(". ")}.`;
}

function TenantForecastTable({
  title,
  grupper,
  totalBudsjettOverride,
  reforhandlingJustering,
  markerteNavn,
}: {
  title: string;
  grupper: TenantForecastGrupper;
  // v36 (2026-09-11, Morten: "marker at den er usikker i leietakerlisten"): normaliserte
  // leietakernavn som er merket "usikker" i Leieforhold til gjennomgang. Beløpet står urørt i
  // tabellen - merket sier bare at det ikke skal leses som sikre penger. Sendes inn som et Set
  // av navn i stedet for hele merke-lista, slik at tabellen slipper å kjenne til datamodellen.
  markerteNavn?: Map<string, ReviewMarkStatus>;
  // Kun satt for Parkering: budsjettert som ÉN totallinje i kildefila, ikke pr. leietaker/bygg/
  // leietype (Morten 2026-08-26) - når satt, vises Totalt-radens budsjett/+/- mot denne
  // verdien i stedet for sum av (alltid null) pr.-rad-budsjett.
  totalBudsjettOverride?: number;
  // Kun satt for Leieinntekter (delA) - samme Map som KontrakterPaUtlopBlock bruker, slik at en
  // leietaker med en åpen kontrakt som utløper i 2026 viser SAMME Gjenstår/+/- her som i
  // "Kontrakter på utløp" for den valgte reforhandlingssannsynligheten, i stedet for at Gjenstår
  // her alltid forutsetter at leieforholdet tar slutt på kontraktens registrerte sluttdato
  // (Morten 2026-08-29: "det man velger under kontrakter på utløp reflekteres fortsatt ikke opp
  // i leieinntekter"). v51: ett Map pr. gruppering (leietaker/bygg/leietype), se
  // beregnReforhandlingJustering.
  reforhandlingJustering?: ReforhandlingJustering;
}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse(`Inntektsprognose: ${title}`, true);
  const [gruppering, setGruppering] = useState<TenantForecastGruppering>("leietaker");
  const rawRows = grupper[gruppering];
  // Justerer gjenstår/avvik pr. leietaker-rad med samme sannsynlighetsvektede
  // "ekstraVedReforhandling"-sum som "Kontrakter på utløp" viser - se
  // beregnEkstraVedReforhandlingByNavn(). Ingen justering ved bygg-/leietype-gruppering (Map er
  // navnebasert) eller for leietakere uten en åpen 2026-kontrakt i snapshotet.
  // v51: justeres nå i ALLE grupperingene, med Map-et for den aktive grupperingen.
  const rows: DisplayTenantRow[] = useMemo(
    () => applyReforhandlingJustering(rawRows, reforhandlingJustering?.[gruppering]),
    [rawRows, gruppering, reforhandlingJustering],
  );
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Lokalt overstyr-lag for kommentarer - viser optimistisk oppdatering rett etter lagring,
  // uten å måtte vente på at grupper-proppen (som kommer fra en fetch lenger oppe i treet)
  // hentes på nytt.
  const [commentOverrides, setCommentOverrides] = useState<Record<string, string>>({});
  // Grønn markering på sluttdato = "aktuelt vindu" (Morten 2026-08-27): frister som enten
  // ligger foran i tid resten av 2026, eller nettopp har passert (inntil 30 dager tilbake) -
  // altså fortsatt relevant å følge opp. Eldre, lenge passerte datoer forblir røde.
  const greenFrom = addDaysIso(localDateString(), -30);

  // v53: hvem som har skrevet kommentaren pr. leietaker - Claude sine analyseforklaringer vises i
  // accent-farge så Morten ser hva som er hans egen vurdering. Lastes sammen med kommentarkartet.
  const [kommentarForfattere, setKommentarForfattere] = useState<Record<string, "claude" | "morten">>({});
  useEffect(() => {
    fetch("/api/income-forecast/tenant-comments")
      .then((r) => r.json())
      .then((d) => {
        setCommentOverrides((prev) => ({ ...(d.kommentarer ?? {}), ...prev }));
        setKommentarForfattere(d.forfattere ?? {});
      })
      .catch(() => {});
  }, []);
  const erClaudeKommentar = (navn: string) => kommentarForfattere[navn.trim().toLowerCase()] === "claude";

  async function saveComment(navn: string, kommentar: string) {
    setCommentOverrides((prev) => ({ ...prev, [navn]: kommentar }));
    try {
      await fetch("/api/income-forecast/tenant-comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navn, kommentar }),
      });
    } catch {
      /* lagring feilet stille - kommentaren vises fortsatt lokalt til neste sideoppdatering */
    }
  }

  function handleGrupperingChange(next: TenantForecastGruppering) {
    setGruppering(next);
    setSearch("");
    setVisibleCount(20);
    setExpanded(new Set());
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // v8 (2026-08-29): tidligere ble r.flyttetInnI-rader skjult her med mindre man søkte -
    // fjernet igjen, siden budsjett-fratrekket (kobleFlyttetInnOgTrekkFra() i
    // scripts/build-tenant-forecast-table.js) nå gir dem et ekte, meningsfullt budsjett/avvik i
    // stedet for et forvirrende budsjett=0. Morten (2026-08-29): "behold alle ledige lokaler og
    // leietakere i leietakerlisten" - viktig også fordi noen av disse (f.eks. Origon AS) allerede
    // har en STOR, helt normal rad fra før (andre bygg) - å skjule HELE raden pga. flyttetInnI på
    // én liten linje ville feilaktig gjemt bort en ellers ordinær leietaker.
    // v52: i Bygg-/Leietype-fanene skjules rader der alt er 0 (typisk budsjettarkets
    // "Avstemmingsdifferanse"-rad med −0 kr) - de sier ingenting og tar en linje.
    const synlige = gruppering === "leietaker" ? rows : rows.filter((r) => Math.abs(r.fakturert) >= 1 || Math.abs(r.gjenstar) >= 1 || Math.abs(r.budsjett ?? 0) >= 1);
    if (!q) return synlige;
    return synlige.filter((r) => r.navn.toLowerCase().includes(q));
  }, [rows, search, gruppering]);

  // Gruppert pr. Ledig-rad-navn - brukes til å vise "flyttet inn her" i TenantDrilldown.
  const flyttetInnByLedigNavn = useMemo(() => {
    const m = new Map<string, TenantForecastRow[]>();
    for (const r of rows) {
      if (!r.flyttetInnI) continue;
      if (!m.has(r.flyttetInnI)) m.set(r.flyttetInnI, []);
      m.get(r.flyttetInnI)!.push(r);
    }
    return m;
  }, [rows]);

  function toggle(navn: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(navn)) next.delete(navn);
      else next.add(navn);
      return next;
    });
  }

  const [sort, setSort] = useState<{ key: "navn" | "fakturert" | "gjenstar" | "budsjett" | "avvik"; dir: 1 | -1 } | null>(null);

  function toggleSort(key: "navn" | "fakturert" | "gjenstar" | "budsjett" | "avvik") {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: key === "navn" ? 1 : -1 };
      return { key, dir: (prev.dir * -1) as 1 | -1 };
    });
    setVisibleCount(20);
  }

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      if (key === "navn") return a.navn.localeCompare(b.navn, "nb-NO") * dir;
      const av = a[key];
      const bv = b[key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [filtered, sort]);

  const visible = sorted.slice(0, visibleCount);

  const totalFakturert = rows.reduce((s, r) => s + r.fakturert, 0);
  const totalGjenstar = rows.reduce((s, r) => s + r.gjenstar, 0);
  const totalBudsjett = totalBudsjettOverride ?? rows.reduce((s, r) => s + (r.budsjett ?? 0), 0);
  const totalAvvik =
    totalBudsjettOverride != null ? totalFakturert + totalGjenstar - totalBudsjettOverride : rows.reduce((s, r) => s + (r.avvik ?? 0), 0);
  const harBudsjett = totalBudsjettOverride != null || rows.some((r) => r.budsjett !== null);

  // v42 (2026-09-11, Morten): overskriftene lå i text-ink-4/font-medium og forsvant i innholdet -
  // de var samme tone som dempede rader. Nå uppercase/semibold i text-ink-2. Rent typografisk;
  // kolonnebreddene og dermed alignmenten er uendret.
  // v43 (2026-09-11, Morten: "legg til slik at man selv kan gjøre kolonnene smalere eller
  // bredere"): faste bredder løste at kolonnene hoppet ved utvidelse, men låste dem også til mine
  // gjetninger. Nå kan hver kolonne dras i kanten av overskriften. Bredden lagres pr. tabell og
  // gruppering i localStorage, så oppsettet overlever reload. table-fixed står fortsatt, så
  // detaljradene kan aldri dytte kolonnene sidelengs.
  type BredKolonne = "startSlutt" | "fakturert" | "gjenstar" | "budsjett" | "avvik" | "kommentar";
  const lagringsNokkel = `inntektsprognose-kolonnebredder:${title}:${gruppering}`;
  // Leses i en lat initialisator, ikke i en effekt: å kalle setState synkront i en effekt gir en
  // ekstra render-runde (og React Compiler flagger det). `typeof window` holder serveren unna
  // localStorage; på serveren blir det tomt objekt, som er nøyaktig samme utgangspunkt som en
  // bruker uten lagrede bredder - ingen hydreringsforskjell.
  const [kolonneBredder, setKolonneBredder] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const lagret = window.localStorage.getItem(lagringsNokkel);
      return lagret ? JSON.parse(lagret) : {};
    } catch {
      return {};
    }
  });

  function startDrag(kolonne: string, startX: number, startBredde: number) {
    function onMove(e: MouseEvent) {
      const ny = Math.max(60, Math.round(startBredde + (e.clientX - startX)));
      setKolonneBredder((prev) => ({ ...prev, [kolonne]: ny }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setKolonneBredder((prev) => {
        try {
          localStorage.setItem(lagringsNokkel, JSON.stringify(prev));
        } catch {
          /* private vindu e.l. - bredden gjelder da kun for denne økten */
        }
        return prev;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function dragHandtak(kolonne: string) {
    return (
      <span
        role="separator"
        aria-label={`Endre bredde på kolonnen ${kolonne}`}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const th = (e.currentTarget as HTMLElement).closest("th");
          startDrag(kolonne, e.clientX, th?.getBoundingClientRect().width ?? 120);
        }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-accent/40"
      />
    );
  }

  function kolonneStil(kolonne: BredKolonne, standard: string) {
    const b = kolonneBredder[kolonne];
    return b ? { width: `${b}px` } : { width: standard };
  }

  function headerButton(label: string, key: "navn" | "fakturert" | "gjenstar" | "budsjett" | "avvik") {
    const active = sort?.key === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-0.5 text-2xs font-semibold uppercase tracking-wide transition hover:text-ink-1 ${active ? "text-ink-1" : "text-ink-2"}`}
      >
        {label}
        {active ? (
          sort!.dir === 1 ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    );
  }

  return (
    <div
      id={title === "Leieinntekter" ? "leieinntekter" : undefined}
      className="scroll-mt-4 flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3"
    >
      <CardHeader
        title={title}
        subtitle={formatKr(totalFakturert + totalGjenstar)}
        alwaysShowSubtitle
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={title === "Parkering" ? Car : Building2}
        iconColorClass="text-ink-3"
      />
      {!collapsed && (
        <>
      {/* v50 (2026-09-11, Morten): "427 rader"-linja mellom headeren og grupperingsfanene er
          fjernet - den skapte et hull i toppen av kortet uten å si noe man handler på. */}
      {totalBudsjettOverride != null && (
        <p className="text-2xs text-ink-4">
          Budsjettert kun som én totallinje i kildefila, ikke pr. {GRUPPERING_LABEL[gruppering].toLowerCase()} — Budsjett/+/- vises derfor kun på
          Totalt-raden, mot samlet fakturert + gjenstår.
        </p>
      )}
      <div className="flex w-fit gap-1 rounded-lg bg-surface-2 p-0.5">
        {GRUPPERINGER.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => handleGrupperingChange(g)}
            className={`rounded-md px-2.5 py-1 text-2xs font-medium transition ${
              gruppering === g ? "bg-accent text-white" : "text-ink-3 hover:text-ink-1"
            }`}
          >
            {GRUPPERING_LABEL[g]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(20);
          }}
          placeholder={`Søk ${GRUPPERING_LABEL[gruppering].toLowerCase()}…`}
          className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">Ingen data i denne kategorien ennå.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          {/* v42 (2026-09-11, Morten: "kolonne må ha samme bredde hele tiden"): tabellen brukte
              automatisk layout, så bredden ble regnet ut fra innholdet - og når en rad ble utvidet
              kom detaljlinjene med lengre tekst inn og dyttet kolonnene sidelengs. table-fixed +
              colgroup låser breddene, slik at de er identiske uansett hva som er åpent. */}
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <colgroup>
              <col />
              {gruppering === "leietaker" && <col style={kolonneStil("startSlutt", "7.5rem")} />}
              <col style={kolonneStil("fakturert", "7.5rem")} />
              <col style={kolonneStil("gjenstar", "7.5rem")} />
              <col style={kolonneStil("budsjett", "7.5rem")} />
              <col style={kolonneStil("avvik", "7.5rem")} />
              {gruppering === "leietaker" && <col style={kolonneStil("kommentar", "13rem")} />}
            </colgroup>
            <thead>
              <tr className="border-b border-line-strong text-left text-ink-2">
                <th className="relative px-3 py-2">{headerButton(GRUPPERING_LABEL[gruppering], "navn")}</th>
                {gruppering === "leietaker" && (
                  <th className="relative whitespace-nowrap px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-ink-2">
                    Start/slutt {PROGNOSE_AR}
                    {dragHandtak("startSlutt")}
                  </th>
                )}
                <th className="relative px-3 py-2 text-right">
                  {headerButton("Fakturert", "fakturert")}
                  {dragHandtak("fakturert")}
                </th>
                <th className="relative px-3 py-2 text-right">
                  {headerButton("Gjenstår", "gjenstar")}
                  {dragHandtak("gjenstar")}
                </th>
                <th className="relative px-3 py-2 text-right">
                  {headerButton("Budsjett", "budsjett")}
                  {dragHandtak("budsjett")}
                </th>
                <th className="relative px-3 py-2 text-right">
                  {headerButton("+/-", "avvik")}
                  {dragHandtak("avvik")}
                </th>
                {gruppering === "leietaker" && (
                  <th className="relative px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-ink-2">
                    Kommentar
                    {dragHandtak("kommentar")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                // v52 (2026-09-11, Morten: "under hver leietype, fjern at man kan ekspandere -
                // samme med bygg"): drilldown kun i Leietaker-fanen. Bygg-/Leietype-radene er
                // aggregater av mange leietakeres linjer, og lista under ble bare lang og støyende.
                const kanEkspandere = gruppering === "leietaker";
                const isOpen = kanEkspandere && expanded.has(row.navn);
                return (
                  <Fragment key={row.navn}>
                    <tr
                      className={`border-t border-line transition-colors ${kanEkspandere ? "cursor-pointer hover:bg-surface-2/50" : ""}`}
                      onClick={kanEkspandere ? () => toggle(row.navn) : undefined}
                    >
                      <td className="max-w-[160px] px-3 py-2 text-ink-1">
                        <span className="flex min-w-0 items-center gap-1">
                          {/* v42 (2026-09-11, Morten): internleie-radene var dempet til text-ink-3,
                              praktisk talt samme tone som kolonneoverskriftene (text-ink-4) - raden
                              leste som en ny overskrift midt i tabellen. Dempingen skulle si "ikke et
                              reelt leieforhold", men det sier info-ikonet ved siden av allerede.
                              Radene bruker nå vanlig tekstfarge. */}
                          <span
                            className={`min-w-0 truncate ${
                              markerteNavn?.get(row.navn.trim().toLowerCase()) === "ma-sjekkes"
                                ? "font-medium text-status-danger"
                                : ""
                            }`}
                          >
                            {row.navn}
                          </span>
                          {markerteNavn?.get(row.navn.trim().toLowerCase()) === "usikker" && (
                            <span
                              className="shrink-0 rounded-full bg-status-warning/15 px-1.5 py-0.5 text-3xs font-medium text-status-warning"
                              title="Merket som usikker i Leieforhold til gjennomgang"
                            >
                              Usikker
                            </span>
                          )}
                          {row.internleie && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Om internleie"
                                    className="shrink-0 text-ink-4 hover:text-ink-1"
                                  >
                                    <Info className="h-3 w-3" />
                                  </button>
                                }
                              />
                              <TooltipContent>
                                Internleie — Mustad sine egne lokaler, ikke et reelt eksternt leieforhold. Vises som fullt fakturert siden det ikke
                                skal måles mot NXT/Fazile som vanlige leietakere.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {/* v42 (2026-09-11, Morten): kommentar- og varselikonet er fjernet fra
                              navnecellen. Kommentaren står allerede i Kommentar-kolonnen, og to
                              små ikoner bak navnet gjorde bare venstrekanten urolig. */}
                        </span>
                      </td>
                      {gruppering === "leietaker" &&
                        (() => {
                          const { start, slutt, sammeLinje } = finn2026StartSlutt(row.linjer);
                          if (!start && !slutt) return <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-4">—</td>;
                          // Vis KUN begge sammen når de faktisk stammer fra samme linje (en reell
                          // kort delårskontrakt) - ellers er dette to urelaterte hendelser (typisk
                          // en leietaker med mange uavhengige parkeringsplass-linjer) som IKKE skal
                          // se ut som én sammenhengende periode. Slutt prioriteres alene (mer
                          // handlingsrelevant enn en isolert "ny linje"-dato) når de er urelaterte.
                          const visBegge = start && slutt && sammeLinje;
                          const sluttAktuell = slutt !== null && slutt >= greenFrom;
                          return (
                            <td className="whitespace-nowrap px-3 py-2 text-2xs font-medium">
                              {visBegge ? (
                                <>
                                  <span className="text-status-danger">start {formatDagManed(start!)}</span>
                                  <span className="text-ink-4"> · </span>
                                  <span className={sluttAktuell ? "text-status-positive" : "text-status-danger"}>slutt {formatDagManed(slutt!)}</span>
                                </>
                              ) : slutt ? (
                                <span className={sluttAktuell ? "text-status-positive" : "text-status-danger"}>slutt {formatDagManed(slutt)}</span>
                              ) : start ? (
                                <span className="text-status-danger">start {formatDagManed(start)}</span>
                              ) : null}
                            </td>
                          );
                        })()}
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2`}>
                        {formatKr(row.fakturert)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2`}>
                        <span className="inline-flex items-center gap-1">
                          {formatKr(row.gjenstar)}
                          {row._reforhandlingsjustering ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Justert for reforhandlingssannsynlighet"
                                    className="shrink-0 text-accent hover:text-ink-1"
                                  >
                                    <Info className="h-3 w-3" />
                                  </button>
                                }
                              />
                              <TooltipContent>
                                Inkluderer {formatKr(row._reforhandlingsjustering, true)} fra &quot;Kontrakter på utløp&quot; - valgt
                                reforhandlingssannsynlighet for denne leietakerens utløpende kontrakt(er).
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2`}>
                        {row.budsjett === null ? "—" : formatKr(row.budsjett)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium ${
                          row.internleie
                            ? "text-ink-4"
                            : row.avvik === null
                              ? "text-ink-4"
                              : row.avvik >= 0
                                ? "text-status-positive"
                                : "text-status-danger"
                        }`}
                      >
                        {row.avvik === null ? "—" : formatKr(row.avvik, true)}
                      </td>
                      {gruppering === "leietaker" && (
                        <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* v53: Mortens kommentar og Claudes forklaring lever side om side. Claude
                              sin lagres under nøkkelen "<navn>||claude" og vises som egen linje i
                              accent-farge under Mortens, slik at ingen av dem overskriver den andre. */}
                          <KommentarCell
                            navn={row.navn}
                            value={commentOverrides[row.navn] ?? row.kommentar ?? ""}
                            onSave={saveComment}
                            fraClaude={erClaudeKommentar(row.navn)}
                          />
                          {commentOverrides[`${row.navn.trim().toLowerCase()}||claude`] && (
                            <KommentarCell
                              navn={`${row.navn}||claude`}
                              value={commentOverrides[`${row.navn.trim().toLowerCase()}||claude`]}
                              onSave={saveComment}
                              fraClaude
                            />
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <TenantDrilldownRows
                        row={row}
                        flyttetInn={flyttetInnByLedigNavn.get(row.navn) ?? []}
                        harStartSluttKolonne={gruppering === "leietaker"}
                        harKommentarKolonne={gruppering === "leietaker"}
                        antallKolonner={gruppering === "leietaker" ? 7 : 5}
                        kommentarer={commentOverrides}
                        onSaveKommentar={saveComment}
                      />
                    )}
                  </Fragment>
                );
              })}
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-3 py-2 text-ink-1">Totalt ({rows.length})</td>
                {gruppering === "leietaker" && <td className="px-3 py-2" />}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalFakturert)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalGjenstar)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{harBudsjett ? formatKr(totalBudsjett) : "—"}</td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    !harBudsjett ? "text-ink-4" : totalAvvik >= 0 ? "text-status-positive" : "text-status-danger"
                  }`}
                >
                  {harBudsjett ? formatKr(totalAvvik, true) : "—"}
                </td>
                {gruppering === "leietaker" && <td className="px-3 py-2" />}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > visible.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((v) => v + 20)}
          className="w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          Vis {Math.min(20, filtered.length - visible.length)} til ({filtered.length - visible.length} gjenstår)
        </button>
      )}
        </>
      )}
    </div>
  );
}

type ManualLineFormValues = {
  beskrivelse: string;
  selskap: string;
  bygg: string;
  konto: string;
  del: IncomeForecastPart;
  belop: string;
  periodeFra: string;
  periodeTil: string;
  kilde: string;
  sikkerhet: ManualLineConfidence;
  aktiv: boolean;
};

const EMPTY_MANUAL_FORM: ManualLineFormValues = {
  beskrivelse: "",
  selskap: "",
  bygg: "",
  konto: "",
  del: "A",
  belop: "",
  periodeFra: "",
  periodeTil: "",
  kilde: "",
  sikkerhet: "middels",
  aktiv: true,
};

function manualLineToForm(line: ManualIncomeLine): ManualLineFormValues {
  return {
    beskrivelse: line.beskrivelse,
    selskap: line.selskap,
    bygg: line.bygg,
    konto: line.konto,
    del: line.del,
    belop: String(line.belop),
    periodeFra: line.periodeFra,
    periodeTil: line.periodeTil,
    kilde: line.kilde ?? "",
    sikkerhet: line.sikkerhet,
    aktiv: line.aktiv,
  };
}

function manualFormToPayload(form: ManualLineFormValues) {
  return {
    beskrivelse: form.beskrivelse.trim(),
    selskap: form.selskap.trim(),
    bygg: form.bygg.trim(),
    konto: form.konto.trim(),
    del: form.del,
    belop: Number(form.belop.replace(",", ".")),
    periodeFra: form.periodeFra,
    periodeTil: form.periodeTil,
    kilde: form.kilde.trim() || null,
    sikkerhet: form.sikkerhet,
    aktiv: form.aktiv,
  };
}

function ManualLineForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: ManualLineFormValues;
  onCancel: () => void;
  onSave: (form: ManualLineFormValues) => void;
}) {
  const [form, setForm] = useState(initial);
  const valid =
    form.beskrivelse.trim() && form.selskap.trim() && form.bygg.trim() && form.konto.trim() && form.belop.trim() && form.periodeFra && form.periodeTil;

  function set<K extends keyof ManualLineFormValues>(key: K, value: ManualLineFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={form.beskrivelse}
        onChange={(e) => set("beskrivelse", e.target.value)}
        placeholder="Beskrivelse (f.eks. Antatt omsetningsleie Q4)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={form.selskap}
          onChange={(e) => set("selskap", e.target.value)}
          placeholder="Selskap"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="text"
          value={form.bygg}
          onChange={(e) => set("bygg", e.target.value)}
          placeholder="Bygg"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="text"
          value={form.konto}
          onChange={(e) => set("konto", e.target.value)}
          placeholder="Konto"
          className="w-24 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={form.del}
          onChange={(e) => set("del", e.target.value as IncomeForecastPart)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          <option value="A">Del A (leie)</option>
          <option value="B">Del B (parkering)</option>
        </select>
        <select
          value={form.sikkerhet}
          onChange={(e) => set("sikkerhet", e.target.value as ManualLineConfidence)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          <option value="høy">Høy sikkerhet</option>
          <option value="middels">Middels sikkerhet</option>
          <option value="lav">Lav sikkerhet</option>
        </select>
        <input
          type="number"
          value={form.belop}
          onChange={(e) => set("belop", e.target.value)}
          placeholder="Beløp (kr)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-0.5 text-2xs text-ink-4">
          Periode fra
          <input
            type="date"
            value={form.periodeFra}
            onChange={(e) => set("periodeFra", e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-2xs text-ink-4">
          Periode til
          <input
            type="date"
            value={form.periodeTil}
            onChange={(e) => set("periodeTil", e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        </label>
        <label className="mt-3.5 flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={form.aktiv} onChange={(e) => set("aktiv", e.target.checked)} />
          Aktiv
        </label>
      </div>
      <input
        type="text"
        value={form.kilde}
        onChange={(e) => set("kilde", e.target.value)}
        placeholder="Kilde/begrunnelse (f.eks. e-post fra leietaker 12.08 om forlengelse)"
        className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function ManualLineRow({
  line,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  line: ManualIncomeLine;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, form: ManualLineFormValues) => void;
  onRemove: (id: string) => void;
}) {
  if (editing) {
    return (
      <li>
        <ManualLineForm initial={manualLineToForm(line)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(line.id, form)} />
      </li>
    );
  }

  return (
    <li>
      <div className={`flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2 ${!line.aktiv ? "opacity-50" : ""}`}>
        <button type="button" onClick={() => onStartEdit(line.id)} aria-label="Rediger linje" className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm text-ink-1">{line.beskrivelse}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-1">{formatKr(line.belop)}</p>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-ink-4">
            <span>
              {line.selskap} · {line.bygg} · konto {line.konto} · Del {line.del}
            </span>
            <span className={`rounded-full px-1.5 py-0.5 font-medium ${CONFIDENCE_STYLE[line.sikkerhet]}`}>{line.sikkerhet}</span>
            {!line.aktiv && <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-medium text-ink-4">Inaktiv</span>}
          </p>
          {line.kilde && <p className="mt-0.5 text-2xs text-ink-4">Kilde: {line.kilde}</p>}
        </button>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          aria-label="Slett linje"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
        >
          ×
        </button>
      </div>
    </li>
  );
}

export default function IncomeForecastSection() {
  const [manualLines, setManualLines] = useState<ManualIncomeLine[]>([]);
  const [loadingManual, setLoadingManual] = useState(true);
  const [includeLowConfidence, setIncludeLowConfidence] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();
  const [contractExpiry2026, setContractExpiry2026] = useState<ContractExpiry2026Snapshot | null>(null);
  const [loadingContractExpiry2026, setLoadingContractExpiry2026] = useState(true);
  const [potential, setPotential] = useState<PotentialIncomeSnapshot | null>(null);
  const [tenantSignals, setTenantSignals] = useState<TenantSignal[]>([]);
  const [omsetningsavregning, setOmsetningsavregning] = useState<OmsetningsavregningSnapshot | null>(null);
  const [loadingOmsetningsavregning, setLoadingOmsetningsavregning] = useState(true);
  const [tenantForecastTable, setTenantForecastTable] = useState<TenantForecastTableSnapshot | null>(null);
  // v17 (2026-09-07, "gjør som en inntektskontroller"-gjennomgangen): løftet opp fra
  // LeieforholdReviewBlock/VacantAreasBlock sine egne fetch-kall - trengs nå OGSÅ av KpiStrip
  // (antall til gjennomgang, datakilde-alder) og LedigeLokalerBlock (kvm-kryssreferanse), så
  // snapshotet hentes én gang her og deles i stedet for å dupliseres.
  const [remainingTenantsSnapshot, setRemainingTenantsSnapshot] = useState<RemainingTenantsSnapshot | null>(null);
  const [, setLoadingRemainingTenants] = useState(true);
  const [vacantAreas, setVacantAreas] = useState<VacantAreasSnapshot | null>(null);
  const [, setLoadingVacantAreas] = useState(true);
  // v19 (2026-09-07, "avstemming"-gjennomgangen): løftet fra BookedTenantsBlock sin egen fetch -
  // trengs OGSÅ av SyncVarsel, som kryssjekker denne live-snapshotens sistOppdatert mot den
  // hardkodede BOOKED_3600_3699-konstanten (lim-inn-i-kildekode-tallet toppboksen faktisk bruker).
  const [bookedTenantsSnapshot, setBookedTenantsSnapshot] = useState<BookedTenantsSnapshot | null>(null);
  const [, setLoadingBookedTenants] = useState(true);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const historyRecordedRef = useRef(false);

  useEffect(() => {
    fetch("/api/income-forecast/contract-expiry-2026")
      .then((r) => r.json())
      .then((data) => {
        setContractExpiry2026(data.snapshot ?? null);
        setLoadingContractExpiry2026(false);
      })
      .catch(() => setLoadingContractExpiry2026(false));
    fetch("/api/income-forecast/potential")
      .then((r) => r.json())
      .then((data) => setPotential(data.snapshot ?? null))
      .catch(() => {});
    fetch("/api/income-forecast/tenant-signals")
      .then((r) => r.json())
      .then((data) => setTenantSignals(data.signals ?? []))
      .catch(() => {});
    fetch("/api/income-forecast/omsetningsavregning")
      .then((r) => r.json())
      .then((data) => {
        setOmsetningsavregning(data.snapshot ?? null);
        setLoadingOmsetningsavregning(false);
      })
      .catch(() => setLoadingOmsetningsavregning(false));
    fetch("/api/income-forecast/tenant-forecast-table")
      .then((r) => r.json())
      .then((data) => setTenantForecastTable(data.snapshot ?? null))
      .catch(() => {});
    fetch("/api/income-forecast/remaining-tenants")
      .then((r) => r.json())
      .then((data) => {
        setRemainingTenantsSnapshot(data.snapshot ?? null);
        setLoadingRemainingTenants(false);
      })
      .catch(() => setLoadingRemainingTenants(false));
    fetch("/api/income-forecast/vacant-areas")
      .then((r) => r.json())
      .then((data) => {
        setVacantAreas(data.snapshot ?? null);
        setLoadingVacantAreas(false);
      })
      .catch(() => setLoadingVacantAreas(false));
    fetch("/api/income-forecast/booked-tenants")
      .then((r) => r.json())
      .then((data) => {
        setBookedTenantsSnapshot(data.snapshot ?? null);
        setLoadingBookedTenants(false);
      })
      .catch(() => setLoadingBookedTenants(false));
    fetch("/api/income-forecast/history")
      .then((r) => r.json())
      .then((data) => setHistory(data.punkter ?? []))
      .catch(() => {});
  }, []);

  function handlePotentialUpdated(next: PotentialIncomeSnapshot["categories"][number]) {
    setPotential((prev) => {
      if (!prev) return prev;
      return { categories: prev.categories.map((c) => (c.key === next.key ? next : c)) };
    });
  }

  function handleSignalUpdated(next: TenantSignal) {
    setTenantSignals((prev) => {
      const idx = prev.findIndex((s) => s.id === next.id);
      if (idx === -1) return [...prev, next];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  const load = useCallback(() => {
    fetch("/api/income-forecast/manual-lines")
      .then((r) => r.json())
      .then((data) => {
        setManualLines((data.manualLines ?? []) as ManualIncomeLine[]);
        setLoadingManual(false);
      })
      .catch(() => setLoadingManual(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddManualLine(form: ManualLineFormValues) {
    const res = await fetch("/api/income-forecast/manual-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualFormToPayload(form)),
    });
    if (res.ok) {
      const created: ManualIncomeLine = await res.json();
      setManualLines((prev) => [...prev, created]);
      setShowManualForm(false);
    }
  }

  async function handleSaveManualEdit(id: string, form: ManualLineFormValues) {
    const res = await fetch(`/api/income-forecast/manual-lines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualFormToPayload(form)),
    });
    if (res.ok) {
      const updated: ManualIncomeLine = await res.json();
      setManualLines((prev) => prev.map((l) => (l.id === id ? updated : l)));
      setEditingManualId(null);
    }
  }

  async function handleRemoveManualLine(id: string) {
    setManualLines((prev) => prev.filter((l) => l.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/income-forecast/manual-lines/${id}`, { method: "DELETE" });
  }

  const activeManualLines = useMemo(
    () => manualLines.filter((l) => l.aktiv && (includeLowConfidence || l.sikkerhet !== "lav")),
    [manualLines, includeLowConfidence],
  );

  const rollup = useMemo(
    () =>
      computeForecastRollup({
        booked: BOOKED_3600_3699,
        remaining: REMAINING,
        manualLines: activeManualLines,
      }),
    [activeManualLines],
  );

  const lastUpdated = oldestSnapshotDate();

  // Samme grunnlag som KontrakterPaUtlopBlock - garanterer at Leieinntekter viser samme
  // reforhandlingsjusterte Gjenstår/+/- for en leietaker med utløpende kontrakt(er) i 2026.
  const reforhandlingJustering = useMemo(() => beregnReforhandlingJustering(contractExpiry2026, tenantSignals), [contractExpiry2026, tenantSignals]);
  const ekstraVedReforhandlingByNavn = reforhandlingJustering.leietaker;

  // v17: hovedprognosen regnes ut ÉN gang her og deles av MainForecastBox (breakdown) og KpiStrip
  // (alltid synlig total) - se beregnHovedprognose sin kommentar.
  const prognose = useMemo(
    () => beregnHovedprognose(rollup, contractExpiry2026, tenantSignals, omsetningsavregning, potential),
    [rollup, contractExpiry2026, tenantSignals, omsetningsavregning, potential],
  );

  // v19 (2026-09-07, "visuell/avstemming"-gjennomgangen): samme avvik-sum som Leieinntekter/
  // Parkering-tabellenes egne Totalt-rader - MÅ inkludere samme pr.-rad reforhandlingsjustering
  // (ekstraVedReforhandlingByNavn) som TenantForecastTable selv legger til for "Leieinntekter" når
  // gruppering="leietaker". Uten den viste KpiStrip og tabellen rett under den to ULIKE avvikstall
  // for samme begrep - forskjellen var nøyaktig prognose.reforhandlingFull. Kopierer tabellens
  // egen pr.-rad-oppslagslogikk (ikke bare += reforhandlingFull) slik at tallene er GARANTERT like
  // selv i kantsaker (et navn i justerings-Mapet uten noen tilsvarende rad).
  // parkeringAvvik eksponeres separat (v28) fordi StorstAvvikBlock sin avstemmingsfot må vise Del
  // B som egen linje for å komme helt fram til avvikTotal - blokken selv ser bare Del A-radene.
  // v50 (2026-09-11, Morten): avviket skal være FULL prognose (726,5 mill - samme tall som
  // hero-boksen, inkl. omsetningsavregning og manuelle linjer) mot fullt budsjett (725 mill).
  // Før dette summerte flisen tabellenes egne +/- (fakturert + gjenstår + reforhandling - budsjett),
  // som utelot omsetningsavregningen (+7,0 mill) og manuelle linjer (−0,5 mill) og derfor viste
  // −4,9 mill mens prognosen faktisk lå over budsjett. Budsjettet er fortsatt summen av
  // leietakertabellens Del A-rader + Del B-samleposten (samme grunnlag som Totalt-radene).
  const { avvikTotal, budsjettTotal } = useMemo(() => {
    const delARows = tenantForecastTable?.delA.leietaker ?? [];
    const delABudsjett = delARows.reduce((s, r) => s + (r.budsjett ?? 0), 0);
    const delBBudsjett = tenantForecastTable?.delBBudsjettTotal ?? 0;
    const budsjett = delABudsjett + delBBudsjett;
    return { avvikTotal: budsjett === 0 ? 0 : prognose.total - budsjett, budsjettTotal: budsjett };
  }, [tenantForecastTable, prognose.total]);

  // Samme reforhandlingsjustering som Leieinntekter-tabellen (TenantForecastTable) og KpiStrip
  // (avvikTotal over) bruker for delA/leietaker - delt via applyReforhandlingJustering slik at
  // StorstAvvikBlock og LedigeLokalerBlock viser SAMME justerte gjenstår/avvik for en leietaker
  // som tabellen rett under dem, i stedet for tabellens tall og en ujustert, mer alarmerende
  // versjon side om side (2026-09-07-gjennomgangen).
  const justertDelALeietakerRader = useMemo(
    () => applyReforhandlingJustering(tenantForecastTable?.delA.leietaker ?? [], ekstraVedReforhandlingByNavn),
    [tenantForecastTable, ekstraVedReforhandlingByNavn],
  );


  const syncAvvik = useMemo(
    () => finnUsynkroniserteKonstanter(remainingTenantsSnapshot, bookedTenantsSnapshot),
    [remainingTenantsSnapshot, bookedTenantsSnapshot],
  );

  const advarslerLive = useMemo(
    () => [...(remainingTenantsSnapshot?.advarsler ?? []), ...(tenantForecastTable?.advarsler ?? [])],
    [remainingTenantsSnapshot, tenantForecastTable],
  );

  // v17: gjenstående budsjett (kr) for alle "Ledig <bygg>"-radene samlet - kryssreferansen
  // LedigeLokalerBlock/VacantAreasBlock viser mot hverandre (kvm vs. kr, to uavhengige kilder).
  const dataSourceFreshness = useMemo(
    () =>
      dataSourceFreshnessList(
        [
          remainingTenantsSnapshot ? { label: "Leieforhold-detalj (Fazile)", dato: remainingTenantsSnapshot.sistOppdatert } : null,
          tenantForecastTable ? { label: "Leietaker-/budsjettabell", dato: tenantForecastTable.sistOppdatert } : null,
          omsetningsavregning ? { label: "Omsetningsavregning", dato: omsetningsavregning.sistOppdatert } : null,
          contractExpiry2026 ? { label: "Kontrakter på utløp", dato: contractExpiry2026.sistOppdatert } : null,
          vacantAreas ? { label: "Ledige arealer (kvm)", dato: vacantAreas.sistOppdatert } : null,
        ].filter((d): d is DataSourceFreshness => d !== null),
      ),
    [remainingTenantsSnapshot, tenantForecastTable, omsetningsavregning, contractExpiry2026, vacantAreas],
  );

  // v20 (2026-09-07): eksplisitt varsel når RECONCILIATION (de håndskrevne, daterte
  // avstemmingsnotatene) er eldre enn den ferskeste andre datakilden - "Eldste datakilde"-KPI-en
  // viser allerede DATOEN, men sier ikke rett ut at INNHOLDET i kontrollene (kronebeløp sitert i
  // fritekst, f.eks. "totalsum-plausibel") kan referere utdaterte tall.
  const nyesteKilde = dataSourceFreshness[dataSourceFreshness.length - 1] ?? null;
  const reconciliationErUtdatert = nyesteKilde !== null && RECONCILIATION.sistOppdatert < nyesteKilde.dato;

  const idagIso = localDateString();
  // v36: merkene fra Leieforhold til gjennomgang, løftet hit slik at Leieinntekter/Parkering-
  // tabellene kan vise "Usikker"-brikken på de samme leietakerne.
  const [reviewMarks, setReviewMarks] = useState<ReviewMark[]>([]);
  useEffect(() => {
    fetch("/api/income-forecast/review-marks")
      .then((r) => r.json())
      .then((d) => setReviewMarks(d.marks ?? []))
      .catch(() => {});
  }, []);
  // v50: "Mangler fakturering"-summen til KPI-flisen er fjernet sammen med flisen - lista selv
  // (ManglerFaktureringBlock) regner ut sitt eget beløp.

  // v44: navn -> status, ikke bare "usikre". Tabellen trenger å skille mellom "usikker" (gul
  // brikke) og "ma-sjekkes" (rødt navn - mistanke om feil tall).
  const markerteNavn = useMemo(() => {
    const m = new Map<string, ReviewMarkStatus>();
    for (const mark of reviewMarks) {
      if (mark.status === "usikker" || mark.status === "ma-sjekkes") m.set(mark.leietaker.trim().toLowerCase(), mark.status);
    }
    return m;
  }, [reviewMarks]);

  // v17: registrerer dagens kjernetall (bokført+gjenstår) i kjørehistorikken - ÉN gang pr. faktisk
  // besøk (ikke pr. re-render), og kun etter at rollup faktisk har reelle tall (unngår å lagre et
  // falskt 0-punkt før snapshottene er hentet ferdig). Se lib/incomeForecastHistory.ts.
  useEffect(() => {
    if (historyRecordedRef.current) return;
    if (prognose.bokfort === 0 && prognose.gjenstar === 0) return;
    historyRecordedRef.current = true;
    fetch("/api/income-forecast/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dato: idagIso, kjerneTotal: prognose.bokfort + prognose.gjenstar }),
    })
      .then((r) => r.json())
      .then((data) => setHistory(data.punkter ?? []))
      .catch(() => {});
  }, [prognose.bokfort, prognose.gjenstar, idagIso]);

  return (
    <div className="border-t-2 border-t-yellow-400/60 p-4">
      <CardHeader
        title={`Inntektsprognose ${PROGNOSE_AR}`}
        // v30 (2026-09-08, Morten: "fjern all teksten øverst som er i liten skrift, men behold
        // sist oppdatert"): "Kjernetall <beløp>" er fjernet herfra. Det var en TREDJE total på
        // samme skjerm (rollup.totalt, altså bokført+gjenstår+manuelle linjer) ved siden av
        // prognosetotalen, og krevde en egen forklaring for ikke å forvirre - selve tegnet på at
        // den ikke hørte hjemme i en header. Tallet finnes fortsatt i breakdownen under.
        // v50: eldste datakilde flyttet hit fra KPI-boksene, som liten tekst ved siden av
        // "Sist oppdatert" (Morten 2026-09-11).
        subtitle={<DatakildeHeaderTekst freshness={dataSourceFreshness} idagIso={idagIso} lastUpdated={lastUpdated} />}
        alwaysShowSubtitle
        icon={TrendingUp}
        iconColorClass="text-yellow-400"
      />
      <div className="flex flex-col gap-5">
          {/* v30: "Øyeblikksbilde — avstemt manuelt mot Visma NXT og Fazile, oppdateres ved
              forespørsel. Ikke en live-integrasjon." fjernet. At det ikke er en live-integrasjon
              går fram av "Sist oppdatert"-datoen i headeren, og hvilke systemer tallene kommer
              fra står i avstemmingspanelet på Tillegg-fanen der det hører hjemme. */}
              <SyncVarsel avvik={syncAvvik} />

              <MainForecastBox
                prognose={prognose}
                potential={potential}
                onPotentialUpdated={handlePotentialUpdated}
                history={history}
                idagIso={idagIso}
                kpi={
                  <KpiStrip
                    avvikTotal={avvikTotal}
                    budsjettTotal={budsjettTotal}
                    reforhandlingVektet={prognose.reforhandlingFull}
                    reforhandlingFulltPotensial={prognose.potensiellEkstrainntektReforhandling100}
                  />
                }
              />


              <TenantForecastTable
                title="Leieinntekter"
                grupper={tenantForecastTable?.delA ?? EMPTY_GRUPPER}
                reforhandlingJustering={reforhandlingJustering}
                markerteNavn={markerteNavn}
              />
              <TenantForecastTable
                title="Parkering"
                grupper={tenantForecastTable?.delB ?? EMPTY_GRUPPER}
                totalBudsjettOverride={tenantForecastTable?.delBBudsjettTotal}
                markerteNavn={markerteNavn}
              />
              <OmsetningsavregningBlock snapshot={omsetningsavregning} loading={loadingOmsetningsavregning} />
              <KontrakterPaUtlopBlock
                snapshot={contractExpiry2026}
                loading={loadingContractExpiry2026}
                signals={tenantSignals}
                onSignalUpdated={handleSignalUpdated}
                leietakerRader={tenantForecastTable?.delA.leietaker ?? []}
              />
              <LedigeLokalerBlock rows={justertDelALeietakerRader} vacantKvm={vacantAreas?.totalLedigKvm ?? null} />

              {/* v31 (2026-09-08, Morten: "fjern hele tillegg-fanen ... infoen der trengs ikke å
                  vises da det bare blir masse støy"). Fanen er borte. Alt som lå der var
                  READ-ONLY visning av kildedata (fakturert pr. periode, bokført pr. konto/leietaker,
                  NXT-budsjett, gjenstår-detalj, leietype-fordeling, ledige arealer, kontraktsutløp,
                  manuelle NXT-bilag, eierandelsregler) - de blokkene er slettet, og er hentbare fra
                  git-historikken hvis noe skal tilbake.
                  MEN tre ting der var IKKE informasjon, de var FUNKSJON, og ville blitt en stille
                  regresjon om de forsvant med resten. De ligger derfor her, kollapset:
                   1) "Mine manuelle linjer" - eneste sted manuelle linjer kan legges inn/endres/
                      slettes, og de inngår i prognosetotalen (i dag −955 438 kr).
                   2) Backup-nedlastingen - eneste eksportvei for manuelt innhold som KUN finnes i
                      Redis og ikke kan utledes på nytt fra Fazile/NXT.
                   3) Live varsler fra siste datakjøring - datakvalitetsavvik som ellers bare står
                      i konsollen til den som kjørte pipelinen. */}
              <VerktoyOgAvstemming>
                <div className="flex flex-col gap-4">
                  {/* v39: flyttet hit fra hovedflyten på Mortens forespørsel. NB: "Tillegg"-fanen
                      finnes ikke lenger (fjernet i v31) - denne kollapsede seksjonen er det som ble
                      igjen av den, og er derfor det nærmeste vi kommer "tilleggsfanen". */}
                  <ManglerFaktureringBlock snapshot={remainingTenantsSnapshot} marks={reviewMarks} />
                  <div className="flex flex-col gap-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Avstemmingskontroller</p>
                    <ReconciliationPanel advarsler={advarslerLive} erUtdatert={reconciliationErUtdatert} />
                    <p className="mt-0.5 flex w-fit items-center gap-1">
                      <a
                        href="/api/income-forecast/backup"
                        download={`inntektsprognose-backup-${idagIso}.json`}
                        className="text-2xs font-medium text-accent hover:text-accent/80"
                      >
                        Last ned backup av manuelt innhold (JSON)
                      </a>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button type="button" aria-label="Om backupen" className="shrink-0 text-ink-4 hover:text-ink-1">
                              <Info className="h-3 w-3" />
                            </button>
                          }
                        />
                        <TooltipContent>
                          Kommentarer, manuelle linjer, potensial-anslag og reforhandlingssignaler - finnes KUN i Redis, ikke
                          re-utledbart fra Fazile/NXT. Ta en kopi av og til.
                        </TooltipContent>
                      </Tooltip>
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Mine manuelle linjer</p>
                    <label className="flex items-center gap-1.5 text-xs text-ink-3">
                      <input
                        type="checkbox"
                        checked={includeLowConfidence}
                        onChange={(e) => setIncludeLowConfidence(e.target.checked)}
                      />
                      Inkluder lav sikkerhet i prognosen
                    </label>
                    {showManualForm ? (
                      <ManualLineForm initial={EMPTY_MANUAL_FORM} onCancel={() => setShowManualForm(false)} onSave={handleAddManualLine} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowManualForm(true)}
                        className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                      >
                        <span className="text-base leading-none">+</span> Ny manuell linje
                      </button>
                    )}
                    {loadingManual ? (
                      <SkeletonRows count={2} />
                    ) : manualLines.length === 0 ? (
                      <p className="text-sm text-ink-3">Ingen manuelle linjer lagt inn ennå.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {manualLines.map((l) => (
                          <ManualLineRow
                            key={l.id}
                            line={l}
                            editing={editingManualId === l.id}
                            onStartEdit={setEditingManualId}
                            onCancelEdit={() => setEditingManualId(null)}
                            onSaveEdit={handleSaveManualEdit}
                            onRemove={(id) => confirmDelete.request(id)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </VerktoyOgAvstemming>
        </div>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={(() => {
          const pending = confirmDelete.pending;
          if (!pending) return "";
          const line = manualLines.find((l) => l.id === pending);
          return `Slette linjen «${line?.beskrivelse ?? ""}»?`;
        })()}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          handleRemoveManualLine(pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
