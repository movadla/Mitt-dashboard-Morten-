"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
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
import type { ContractExpiry2026Snapshot, ContractExpiryStatus } from "@/lib/contractExpiry2026";
import type { PotentialIncomeCategoryKey, PotentialIncomeSnapshot } from "@/lib/incomeForecastPotential";
import type { TenantForecastGrupper, TenantForecastGruppering, TenantForecastRow, TenantForecastTableSnapshot } from "@/lib/tenantForecastTable";
import type { OmsetningsavregningSnapshot } from "@/lib/omsetningsavregning";
import type { NxtBudgetSnapshot } from "@/lib/nxtBudget";
import type { VacantAreasSnapshot } from "@/lib/vacantAreas";
import type { TenantSignal, TenantSignalType } from "@/lib/tenantSignals";
import { computeForecastRollup, type ForecastRollup, type PartTotals } from "@/lib/incomeForecastCompute";
import type { IncomeForecastPart, ManualIncomeLine, ManualLineConfidence } from "@/lib/incomeForecastManual";
import { vibrate } from "@/lib/haptics";

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

const CONTRACT_EXPIRY_STATUS_LABEL: Record<ContractExpiryStatus, string> = {
  apen: "Åpen",
  reforhandlet: "Reforhandlet",
};

const CONTRACT_EXPIRY_STATUS_STYLE: Record<ContractExpiryStatus, string> = {
  apen: "bg-status-warning/15 text-status-warning",
  reforhandlet: "bg-status-positive/12 text-status-positive",
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

function InvoicedBlock() {
  const totalA = INVOICED.periods.reduce((s, p) => s + p.delA, 0);
  const totalB = INVOICED.periods.reduce((s, p) => s + p.delB, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Fakturert (Visma NXT, hittil i år)</p>
      <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-4">
        Historisk måned-for-måned-oversikt, periode 1-8. Ikke lenger en del av "Bokført" i toppboksen - erstattet
        2026-08-30 av "Bokført totalt, konto 3600-3699" under (rå helårs-kontosaldo, unngår en dobbelttellingsfeil
        denne periodiserte metoden hadde med manuelt bokførte bilag).
      </p>
      {INVOICED.periods.length === 0 ? (
        <p className="text-sm text-ink-3">Ingen data lagt inn ennå.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2 text-2xs font-medium">Periode</th>
                <th className="px-3 py-2 text-right text-2xs font-medium">Del A (leie)</th>
                <th className="px-3 py-2 text-right text-2xs font-medium">Del B (parkering)</th>
              </tr>
            </thead>
            <tbody>
              {INVOICED.periods.map((p) => (
                <tr key={p.periode} className="border-t border-line">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{p.periode}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(p.delA)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(p.delB)}</td>
                </tr>
              ))}
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-3 py-2 text-ink-1">Totalt</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalA)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalB)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BookedCompanyRow({ company }: { company: (typeof BOOKED_3600_3699.perSelskap)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td colSpan={2} className="p-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left"
          >
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
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
              <span className="truncate">{company.selskap}</span>
              <span className="shrink-0 text-2xs text-ink-4">({company.bygg.length} bygg)</span>
            </span>
            <span className="whitespace-nowrap tabular-nums font-medium text-ink-1">{formatKr(company.belop)}</span>
          </button>
        </td>
      </tr>
      {open &&
        company.bygg.map((b) => (
          <tr key={b.bygg} className="border-t border-line bg-surface-2/40">
            <td className="px-3 py-1.5 pl-9 text-sm text-ink-2">{b.bygg}</td>
            <td className="px-3 py-1.5 text-right text-sm tabular-nums text-ink-2">{formatKr(b.belop)}</td>
          </tr>
        ))}
    </>
  );
}

function BookedAccountRangeBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Bokført konto 3600-3699", true);
  const invoicedTotal = INVOICED.periods.reduce((s, p) => s + p.delA + p.delB, 0);
  const diff = BOOKED_3600_3699.totalBelop - invoicedTotal;
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Bokført totalt, konto 3600-3699"
        subtitle={formatKr(BOOKED_3600_3699.totalBelop)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <>
          <p className="mb-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-4">
            OPPDATERT 2026-08-30: dette er nå selve kilden til "Bokført" i toppboksen (se breakdown der) - ikke
            lenger bare en kontrollstørrelse. Rå helårs-kontosaldo (generalLedgerBalanceForOrgUnit3, ingen
            periodebegrensning, ingen egen liste over manuelle bilag å holde synkronisert) - erstattet den tidligere
            INVOICED+manuelle bilag-konstruksjonen etter at en dobbelttellingsfeil ble bekreftet der (et manuelt
            bokført bilag ble trukket fra to ganger - én gang i periodesaldoen, én gang i den separate
            bilagslisten). Bygg-nedbrytning vist under per selskap, leietaker-nedbrytning kommer i en senere runde.
          </p>
          <p className="mb-2 text-2xs text-ink-4">
            Differanse mot INVOICED (historisk, periode 1-8): <span className="font-medium tabular-nums text-ink-2">{formatKr(diff)}</span> — forventet,
            forklares av forhåndsfakturerte poster i periode 9-12 som allerede er bokført.
          </p>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[380px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-3 py-2 text-2xs font-medium">Selskap</th>
                  <th className="px-3 py-2 text-right text-2xs font-medium">Beløp</th>
                </tr>
              </thead>
              <tbody>
                {BOOKED_3600_3699.perSelskap.map((c) => (
                  <BookedCompanyRow key={c.selskap} company={c} />
                ))}
                <tr className="border-t border-line-strong font-semibold">
                  <td className="px-3 py-2 text-ink-1">Totalt</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(BOOKED_3600_3699.totalBelop)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function NxtBudgetCompanyRow({ company }: { company: NxtBudgetSnapshot["perSelskap"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td colSpan={2} className="p-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left"
          >
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
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
              <span className="truncate">{company.selskap}</span>
              <span className="shrink-0 text-2xs text-ink-4">
                ({company.bygg.length} bygg{company.eierandel < 1 ? `, ${Math.round(company.eierandel * 100)}% eierandel` : ""})
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums font-medium text-ink-1">{formatKr(company.belop)}</span>
          </button>
        </td>
      </tr>
      {open &&
        company.bygg.map((b) => (
          <tr key={b.bygg} className="border-t border-line bg-surface-2/40">
            <td className="px-3 py-1.5 pl-9 text-sm text-ink-2">{b.bygg}</td>
            <td className="px-3 py-1.5 text-right text-sm tabular-nums text-ink-2">{formatKr(b.belop)}</td>
          </tr>
        ))}
    </>
  );
}

function NxtBudgetBlock({ rollup }: { rollup: ForecastRollup }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Budsjett NXT konto 3600-3699", true);
  const [snapshot, setSnapshot] = useState<NxtBudgetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPerBygg, setShowPerBygg] = useState(false);

  useEffect(() => {
    fetch("/api/income-forecast/nxt-budget")
      .then((r) => r.json())
      .then((data) => {
        setSnapshot(data.snapshot ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Budsjett 2026 (NXT, konto 3600-3699)"
        subtitle={snapshot ? formatKr(snapshot.totalBelop) : "…"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <>
          {loading ? (
            <SkeletonRows count={3} />
          ) : !snapshot ? (
            <p className="text-sm text-ink-3">Ingen budsjettdata funnet.</p>
          ) : (
            <>
              <p className="mb-2 text-2xs text-ink-4">
                Kilde: Visma NXT budget/budgetLine (budsjett {snapshot.budgetNo}), samme kontogruppe som &quot;Bokført
                totalt&quot; over. Eierandel-korrigert for Fåbro Eiendom AS/Strandveien 10/Strandveien 4-8. {snapshot.perSelskap.length}{" "}
                selskaper har budsjett i denne kontogruppen — {snapshot.selskaperUtenBudsjett.length} andre (rene drift-/
                prosjektselskaper) har ingen.
              </p>
              <div className="mb-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                <p className="text-2xs text-ink-4">
                  Avvik mot prognose (Bokført + Gjenstår ={" "}
                  <span className="font-medium text-ink-2">{formatKr(rollup.totalt)}</span>):{" "}
                  <span className={`font-semibold tabular-nums ${rollup.totalt - snapshot.totalBelop < 0 ? "text-status-danger" : "text-status-positive"}`}>
                    {formatKr(rollup.totalt - snapshot.totalBelop)}
                  </span>{" "}
                  ({(((rollup.totalt - snapshot.totalBelop) / snapshot.totalBelop) * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %)
                </p>
              </div>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[380px] text-sm">
                  <thead>
                    <tr className="text-left text-ink-4">
                      <th className="px-3 py-2 text-2xs font-medium">Selskap</th>
                      <th className="px-3 py-2 text-right text-2xs font-medium">Budsjett</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.perSelskap.map((c) => (
                      <NxtBudgetCompanyRow key={c.selskap} company={c} />
                    ))}
                    <tr className="border-t border-line-strong font-semibold">
                      <td className="px-3 py-2 text-ink-1">Totalt</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(snapshot.totalBelop)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setShowPerBygg((v) => !v)}
                className="mt-2 text-2xs font-medium text-accent hover:text-accent/80"
              >
                {showPerBygg ? "Skjul pr. bygg (tvers av selskap)" : "Vis pr. bygg (tvers av selskap)"}
              </button>
              {showPerBygg && (
                <div className="mt-2 flex flex-col gap-1">
                  {snapshot.perBygg.map((b) => (
                    <div key={b.bygg} className="flex items-center justify-between gap-2 border-t border-line py-1 text-sm">
                      <span className="text-ink-2">{b.bygg}</span>
                      <span className="tabular-nums text-ink-2">{formatKr(b.belop)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function BookedTenantRow({ tenant }: { tenant: BookedTenantsSnapshot["tenants"][number] }) {
  const [open, setOpen] = useState(false);
  const sumLines = tenant.lines.reduce((s, l) => s + l.belop, 0);
  const avstemmer = Math.abs(sumLines - tenant.totalBelop) < 1;
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-ink-1">
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
          <span className="truncate text-sm">{tenant.navn}</span>
          <span className="shrink-0 text-2xs text-ink-4">
            {tenant.lines.length} {tenant.lines.length === 1 ? "linje" : "linjer"}
          </span>
        </span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">{formatKr(tenant.totalBelop)}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 pb-3 pt-1">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-2 py-1.5 text-2xs font-medium">Konto</th>
                  <th className="px-2 py-1.5 text-2xs font-medium">Bygg</th>
                  <th className="px-2 py-1.5 text-2xs font-medium">Selskap</th>
                  <th className="px-2 py-1.5 text-right text-2xs font-medium">Fakturert</th>
                </tr>
              </thead>
              <tbody>
                {tenant.lines.map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-2">{l.accountNo}</td>
                    <td className="px-2 py-1.5 text-ink-2">{l.bygg}</td>
                    <td className="px-2 py-1.5 text-ink-3">{l.selskap}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-2">{formatKr(l.belop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`mt-2 text-2xs ${avstemmer ? "text-status-positive" : "text-status-danger"}`}>
            {avstemmer
              ? `Avstemt: sum av linjene stemmer med totalen (${formatKr(sumLines)})`
              : `Avvik: sum av linjene (${formatKr(sumLines)}) matcher IKKE totalen (${formatKr(tenant.totalBelop)})`}
          </p>
        </div>
      )}
    </div>
  );
}

function BookedTenantsBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Bokført per leietaker", true);
  const [snapshot, setSnapshot] = useState<BookedTenantsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    fetch("/api/income-forecast/booked-tenants")
      .then((r) => r.json())
      .then((data) => {
        setSnapshot(data.snapshot ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.tenants;
    return snapshot.tenants.filter((t) => t.navn.toLowerCase().includes(q));
  }, [snapshot, search]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div id="drilldown-bokfort" className="scroll-mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Bokført per leietaker"
        subtitle={snapshot ? `${formatKr(snapshot.totalBelop)} · ${snapshot.antallLeietakere} leietakere` : "Laster…"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Users}
        iconColorClass="text-accent"
      />
      {!collapsed && (
        <>
          <p className="mb-2 text-2xs text-ink-4">
            Kilde: Visma NXT <code>generalLedgerTransaction</code>, konto 3600-3699, 2026 — gruppert per leietaker,
            inkl. en egen &quot;Andre&quot;-oppføring for bokføringer uten leietakerreferanse (bl.a. den store
            omsetningsleie-avsetningen fra 2025). Egen kontrollstørrelse — differansen mot &quot;Bokført totalt&quot; over (
            {formatKr(BOOKED_3600_3699.totalBelop)}, fra periodebalanse) er nå kun {formatKr(snapshot ? snapshot.totalBelop - BOOKED_3600_3699.totalBelop : 0)}{" "}
            (~0,1 %) siden dette er en annen NXT-tabell (rå transaksjoner) — forventet, ikke en feil.
          </p>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(30);
              }}
              placeholder="Søk leietaker…"
              className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
            />
          </div>
          {loading ? (
            <SkeletonRows count={4} />
          ) : !snapshot || filtered.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen leietakere funnet.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {visible.map((t) => (
                  <BookedTenantRow key={t.navn} tenant={t} />
                ))}
              </div>
              {filtered.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 30)}
                  className="mt-2 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                >
                  Vis {Math.min(30, filtered.length - visible.length)} til ({filtered.length - visible.length} gjenstår)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const BYGG_STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  avsluttet: "Avsluttet, nullstilt",
  "ikke-matchet-i-nxt": "Ikke funnet i NXT",
  "forklart-omsetningsleie": "Omsetningsleie i NXT",
  "forklart-kontraktsendring": "Kontraktsendring i år",
  "forklart-engangsgebyr": "Engangsgebyr (exit fee)",
  "forklart-nxt-feilkoding": "Feilkoding i NXT",
  "intern-mustad": "Intern (Mustad selv)",
  "forklart-parkering-onepark": "Onepark-estimat lagt til",
  "forklart-parkering-uten-fazile-linje": "Parkering uten Fazile-linje",
  "fazile-plan-mangler": "Ingen Fazile-faktura planlagt",
};

const BYGG_STATUS_STYLE: Record<string, string> = {
  ok: "bg-surface-3 text-ink-3",
  avsluttet: "bg-status-danger/12 text-status-danger",
  "ikke-matchet-i-nxt": "bg-accent/15 text-accent",
  "forklart-omsetningsleie": "bg-status-warning/15 text-status-warning",
  "forklart-kontraktsendring": "bg-status-warning/15 text-status-warning",
  "forklart-engangsgebyr": "bg-status-warning/15 text-status-warning",
  "forklart-nxt-feilkoding": "bg-status-warning/15 text-status-warning",
  "intern-mustad": "bg-surface-3 text-ink-4",
  "forklart-parkering-onepark": "bg-status-positive/12 text-status-positive",
  "forklart-parkering-uten-fazile-linje": "bg-status-warning/15 text-status-warning",
  "fazile-plan-mangler": "bg-status-warning/15 text-status-warning",
};

const REVIEW_STATUSES = [
  "ikke-matchet-i-nxt",
  "forklart-omsetningsleie",
  "forklart-kontraktsendring",
  "forklart-engangsgebyr",
  "forklart-nxt-feilkoding",
  "avsluttet",
  "intern-mustad",
  "forklart-parkering-onepark",
  "forklart-parkering-uten-fazile-linje",
  "fazile-plan-mangler",
] as const;

function RemainingTenantsFullRow({ tenant }: { tenant: RemainingTenantsSnapshot["tenants"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-ink-1">
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
          <span className="truncate text-sm">{tenant.navn}</span>
          <span className="shrink-0 text-2xs text-ink-4">
            {tenant.byggGrupper.length} {tenant.byggGrupper.length === 1 ? "bygg" : "bygg"}
          </span>
        </span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">{formatKr(tenant.totalBelop)}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <p className="mb-2 text-2xs text-ink-4">
            Full årsverdi 2026: <span className="font-medium tabular-nums text-ink-2">{formatKr(tenant.fullArsverdi2026)}</span> − allerede
            fakturert i NXT: <span className="font-medium tabular-nums text-ink-2">{formatKr(tenant.alleredeFakturertNxt2026)}</span> ={" "}
            <span className="font-medium tabular-nums text-ink-1">{formatKr(tenant.totalBelop)}</span>
          </p>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-2 py-1.5 text-2xs font-medium">Bygg</th>
                  <th className="px-2 py-1.5 text-right text-2xs font-medium">Full årsverdi</th>
                  <th className="px-2 py-1.5 text-right text-2xs font-medium">Allerede fakturert</th>
                  <th className="px-2 py-1.5 text-right text-2xs font-medium">Gjenstår</th>
                  <th className="px-2 py-1.5 text-2xs font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenant.byggGrupper.map((b, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-2 py-1.5 text-ink-2">{b.bygg}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-3">
                      {formatKr(b.fullArsverdi2026DelA + b.fullArsverdi2026DelB)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-3">
                      {formatKr(b.alleredeFakturertDelA + b.alleredeFakturertDelB)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium text-ink-1">
                      {formatKr(b.gjenstarTotal)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${BYGG_STATUS_STYLE[b.status]}`}>
                        {BYGG_STATUS_LABEL[b.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tenant.byggGrupper.some((b) => b.forklaring) && (
            <ul className="mt-2 flex flex-col gap-1">
              {tenant.byggGrupper
                .filter((b) => b.forklaring)
                .map((b, i) => (
                  <li key={i} className="text-2xs text-ink-4">
                    <span className="font-medium text-ink-3">{b.bygg}:</span> {b.forklaring}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RemainingTenantsFullBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Gjenstår per leietaker (Fazile)", true);
  const [snapshot, setSnapshot] = useState<RemainingTenantsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    fetch("/api/income-forecast/remaining-tenants")
      .then((r) => r.json())
      .then((data) => {
        setSnapshot(data.snapshot ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.tenants;
    return snapshot.tenants.filter((t) => t.navn.toLowerCase().includes(q));
  }, [snapshot, search]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Gjenstår per leietaker (Fazile)"
        subtitle={snapshot ? `${formatKr(snapshot.totalBelop)} · ${snapshot.antallLeietakere} leietakere` : "Laster…"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Users}
        iconColorClass="text-accent"
      />
      {!collapsed && (
        <>
          <p className="mb-2 text-2xs text-ink-4">
            Kilde: full 2026-verdi per leieforhold (Fazile, årsbeløp justert for kontraktens start-/sluttdato i 2026) minus allerede
            fakturert i NXT (eierandel-korrigert) for samme leietaker+bygg. Samme tall som &quot;Gjenstår å fakturere&quot; over,
            brutt ned per leietaker — ikke et separat, konkurrerende estimat.
          </p>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(30);
              }}
              placeholder="Søk leietaker…"
              className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
            />
          </div>
          {loading ? (
            <SkeletonRows count={4} />
          ) : !snapshot || filtered.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen leietakere funnet.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {visible.map((t) => (
                  <RemainingTenantsFullRow key={t.navn} tenant={t} />
                ))}
              </div>
              {filtered.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 30)}
                  className="mt-2 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                >
                  Vis {Math.min(30, filtered.length - visible.length)} til ({filtered.length - visible.length} gjenstår)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function RemainingBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Gjenstår å fakturere", true);
  const total = REMAINING.totalDelA + REMAINING.totalDelB;
  return (
    <div id="drilldown-gjenstar" className="scroll-mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Gjenstår å fakturere"
        subtitle={formatKr(total)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs text-ink-4">
            Del A (leie): <span className="font-medium tabular-nums text-ink-2">{formatKr(REMAINING.totalDelA)}</span> · Del B
            (parkering): <span className="font-medium tabular-nums text-ink-2">{formatKr(REMAINING.totalDelB)}</span> ·{" "}
            {REMAINING.antallLeieforhold} leieforhold (leietaker+bygg)
          </p>
          <p className="text-2xs text-ink-4">
            Full leietaker-detalj i &quot;Gjenstår per leietaker (Fazile)&quot; under. {REMAINING.antallAvsluttetNullstilt} leieforhold
            var allerede avsluttet i Fazile og er nullstilt, {REMAINING.antallIkkeMatchetFlagget} har ingen tilsvarende bokføring
            funnet i NXT i år, {REMAINING.antallForklartOmsetningsleie} CC Vest-leieforhold har trolig omsetningsleie-avregning i
            NXT utover grunnleien, {REMAINING.antallForklartKontraktsendring} har trolig blitt endret/indeksregulert i løpet av
            2026, og {REMAINING.antallInternMustad} er interne Mustad-oppføringer (ikke reelle eksterne leieforhold) — se
            &quot;Leieforhold til gjennomgang&quot; under for full liste (kan eksporteres til Excel).
          </p>
        </div>
      )}
    </div>
  );
}

function LeietypeBreakdownBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Full 2026-verdi per leietype", true);
  const rows = useMemo(
    () => Object.entries(LEIETYPE_BREAKDOWN.perLeietype).sort((a, b) => b[1] - a[1]),
    [],
  );
  const max = rows.length > 0 ? Math.max(...rows.map(([, v]) => Math.abs(v))) : 1;

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Full 2026-verdi per leietype"
        subtitle={formatKr(LEIETYPE_BREAKDOWN.totalArsleie)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs text-ink-4">
            Drilldown for &quot;Gjenstår å fakturere&quot;, hentet direkte fra Fazile (leietakerliste, gruppert på leietype,
            {" "}
            {LEIETYPE_BREAKDOWN.antallLinjer} aktive kontraktslinjer, {formatDateDMY(LEIETYPE_BREAKDOWN.sistOppdatert)}).
            MERK: dette er BREDERE enn selve gjenstår-tallet over — det inkluderer alle kostnadstyper (felleskostnader,
            energi, markedsføringsbidrag osv.), mens &quot;Gjenstår å fakturere&quot; kun teller ren husleie/parkering. Til
            orientering, ikke en nedbryting av det tallet.
          </p>
          <div className="flex flex-col gap-1">
            {rows.map(([leietype, belop]) => (
              <div key={leietype} className="flex items-center gap-2">
                <span className="w-36 shrink-0 truncate text-2xs text-ink-3">{leietype}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full ${belop < 0 ? "bg-status-danger/70" : "bg-accent/70"}`}
                    style={{ width: `${Math.min(100, (Math.abs(belop) / max) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-2xs tabular-nums text-ink-2">{formatKr(belop)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VacantAreasBuildingRow({ building }: { building: VacantAreasSnapshot["bygg"][number] }) {
  const [open, setOpen] = useState(false);
  const types = useMemo(() => Object.entries(building.perArealtype).sort((a, b) => b[1] - a[1]), [building]);
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm text-ink-1">{building.bygg}</span>
          <span className="text-2xs text-ink-4">{building.antall} arealer</span>
        </span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">
          {building.totalKvm.toLocaleString("nb-NO")} kvm
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 border-t border-line px-3 py-2">
          {types.map(([type, kvm]) => (
            <p key={type} className="flex justify-between text-2xs text-ink-4">
              <span>{type}</span>
              <span className="tabular-nums text-ink-2">{kvm.toLocaleString("nb-NO")} kvm</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function VacantAreasBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Ledige arealer", true);
  const [snapshot, setSnapshot] = useState<VacantAreasSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(15);
  const [utleieSignaler, setUtleieSignaler] = useState<TenantSignal[]>([]);

  useEffect(() => {
    fetch("/api/income-forecast/vacant-areas")
      .then((r) => r.json())
      .then((data) => {
        setSnapshot(data.snapshot ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/income-forecast/tenant-signals")
      .then((r) => r.json())
      .then((data) => setUtleieSignaler(((data.signals ?? []) as TenantSignal[]).filter((s) => s.type === "utleie")))
      .catch(() => {});
  }, []);

  function handleUtleieSignalUpdated(next: TenantSignal) {
    setUtleieSignaler((prev) => {
      const idx = prev.findIndex((s) => s.id === next.id);
      if (idx === -1) return [...prev, next];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  const arealtypeRows = useMemo(() => (snapshot ? Object.entries(snapshot.perArealtype).sort((a, b) => b[1] - a[1]) : []), [snapshot]);
  const maxType = arealtypeRows.length > 0 ? arealtypeRows[0][1] : 1;
  const visibleBygg = snapshot ? snapshot.bygg.slice(0, visibleCount) : [];

  return (
    <div id="drilldown-ledige-lokaler" className="scroll-mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Ledige arealer"
        subtitle={snapshot ? `${snapshot.totalLedigKvm.toLocaleString("nb-NO")} kvm` : "…"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <>
          {loading ? (
            <SkeletonRows count={3} />
          ) : !snapshot ? (
            <p className="text-sm text-ink-3">Ingen arealdata funnet.</p>
          ) : (
            <>
              <p className="mb-2 text-2xs text-ink-4">
                Kilde: Fazile arealoversikt, status Ledig, hele porteføljen ({snapshot.sistOppdatert}).{" "}
                {snapshot.antallArealer} ledige arealer i {snapshot.antallBygg} bygg, eksklusivt kvm (ikke inkl.
                fellesareal-andel). Datagrunnlag for &quot;Potensiell inntekt: ledige lokaler&quot;-boksen over — ingen
                kvm-pris er lagt inn ennå, så den boksen forblir et manuelt anslag til videre.
              </p>
              {utleieSignaler.length > 0 && (
                <div className="mb-3 rounded-xl border border-line bg-surface-2 p-3">
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-4">
                    Aktive utleieprosjekter i Salesforce (sannsynlighet for utleie)
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {utleieSignaler.map((s) => (
                      <div key={s.id} className="rounded-lg border border-line bg-surface-1 p-2">
                        <p className="text-sm text-ink-1">{s.navn}</p>
                        <SignalEditor
                          id={s.id}
                          type="utleie"
                          signal={s}
                          fallbackNavn={s.navn}
                          fallbackBygg={s.bygg}
                          onUpdated={handleUtleieSignalUpdated}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-3 flex flex-col gap-1">
                {arealtypeRows.map(([type, kvm]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-2xs text-ink-3">{type}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-status-warning/70" style={{ width: `${Math.min(100, (kvm / maxType) * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-2xs tabular-nums text-ink-2">{kvm.toLocaleString("nb-NO")} kvm</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {visibleBygg.map((b) => (
                  <VacantAreasBuildingRow key={b.bygg} building={b} />
                ))}
              </div>
              {snapshot.bygg.length > visibleBygg.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 15)}
                  className="mt-2 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                >
                  Vis {Math.min(15, snapshot.bygg.length - visibleBygg.length)} til ({snapshot.bygg.length - visibleBygg.length} gjenstår)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ReviewRow {
  leietaker: string;
  bygg: string;
  status: RemainingByggStatus;
  forklaring: string | null;
  fullArsverdi: number;
  alleredeFakturert: number;
  gjenstar: number;
}

function ReviewRowItem({ row }: { row: ReviewRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-ink-1">{row.leietaker}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${BYGG_STATUS_STYLE[row.status]}`}>
              {BYGG_STATUS_LABEL[row.status]}
            </span>
          </span>
          <span className="truncate text-2xs text-ink-4">{row.bygg}</span>
        </span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">{formatKr(row.gjenstar)}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <p className="text-2xs text-ink-4">
            Full årsverdi: <span className="font-medium tabular-nums text-ink-2">{formatKr(row.fullArsverdi)}</span> · Allerede
            fakturert: <span className="font-medium tabular-nums text-ink-2">{formatKr(row.alleredeFakturert)}</span>
          </p>
          {row.forklaring && <p className="mt-1 text-2xs text-ink-4">{row.forklaring}</p>}
        </div>
      )}
    </div>
  );
}

function LeieforholdReviewBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Leieforhold til gjennomgang", true);
  const [snapshot, setSnapshot] = useState<RemainingTenantsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    fetch("/api/income-forecast/remaining-tenants")
      .then((r) => r.json())
      .then((data) => {
        setSnapshot(data.snapshot ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const rows = useMemo<ReviewRow[]>(() => {
    if (!snapshot) return [];
    const out: ReviewRow[] = [];
    for (const t of snapshot.tenants) {
      for (const b of t.byggGrupper) {
        if (!(REVIEW_STATUSES as readonly string[]).includes(b.status)) continue;
        out.push({
          leietaker: t.navn,
          bygg: b.bygg,
          status: b.status,
          forklaring: b.forklaring,
          fullArsverdi: b.fullArsverdi2026DelA + b.fullArsverdi2026DelB,
          alleredeFakturert: b.alleredeFakturertDelA + b.alleredeFakturertDelB,
          gjenstar: b.gjenstarTotal,
        });
      }
    }
    return out.sort((a, b) => b.fullArsverdi - a.fullArsverdi);
  }, [snapshot]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.leietaker.toLowerCase().includes(q) || r.bygg.toLowerCase().includes(q));
  }, [rows, search]);

  const visible = filtered.slice(0, visibleCount);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Leieforhold til gjennomgang"
        subtitle={`${rows.length} av ${snapshot ? snapshot.tenants.reduce((s, t) => s + t.byggGrupper.length, 0) : "…"} leieforhold`}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={AlertTriangle}
        iconColorClass="text-status-warning"
      />
      {!collapsed && (
        <>
          <p className="mb-2 text-2xs text-ink-4">
            Alle leieforhold der beløpet er usikkert eller bør sjekkes manuelt — ikke matchet mot NXT, mistenkt
            omsetningsleie-avregning, mistenkt kontraktsendring i året, eller allerede avsluttet og nullstilt. Ikke feil i seg
            selv, men verdt en manuell kontroll. Eksporter til Excel for gjennomgang utenfor appen.
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-4">
            {REVIEW_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`rounded-full px-2 py-0.5 font-medium ${BYGG_STATUS_STYLE[s]}`}>{BYGG_STATUS_LABEL[s]}</span>
                <span className="tabular-nums">{counts[s] ?? 0}</span>
              </span>
            ))}
          </div>
          <a
            href="/api/income-forecast/remaining-tenants/export"
            className="mb-2 inline-block text-2xs font-medium text-accent hover:text-accent/80"
          >
            Eksporter til Excel
          </a>
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
              <div className="flex flex-col gap-1.5">
                {visible.map((r, i) => (
                  <ReviewRowItem key={`${r.leietaker}||${r.bygg}||${i}`} row={r} />
                ))}
              </div>
              {filtered.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 30)}
                  className="mt-2 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                >
                  Vis {Math.min(30, filtered.length - visible.length)} til ({filtered.length - visible.length} gjenstår)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const LEIETYPE_STYLE: Record<OmsetningsavregningSnapshot["butikker"][number]["leietype"], string> = {
  Minimumsleie: "bg-surface-3 text-ink-3",
  Omsetningsleie: "bg-status-warning/15 text-status-warning",
  "Fast leie": "bg-surface-3 text-ink-3",
};

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

function ContractExpiryRow({
  contract,
  signal,
  onSignalUpdated,
}: {
  contract: ContractExpiry2026Snapshot["contracts"][number];
  signal: TenantSignal | undefined;
  onSignalUpdated: (next: TenantSignal) => void;
}) {
  const [open, setOpen] = useState(false);
  const utlop = contract.minSlutt === contract.maxSlutt ? formatDateDMY(contract.maxSlutt) : `${formatDateDMY(contract.minSlutt)}–${formatDateDMY(contract.maxSlutt)}`;
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-ink-1">{contract.leietaker}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${CONTRACT_EXPIRY_STATUS_STYLE[contract.status as ContractExpiryStatus]}`}>
              {CONTRACT_EXPIRY_STATUS_LABEL[contract.status as ContractExpiryStatus]}
            </span>
            {signal && <span className="shrink-0 text-2xs text-ink-4">{signal.sannsynlighetProsent}%</span>}
          </span>
          <span className="truncate text-2xs text-ink-4">
            {contract.bygg} · Utløp {utlop}
          </span>
        </span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">{formatKr(contract.totalArsleie)}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <ContractExpiryDetails contract={contract} />
          <SignalEditor
            id={contract.kontraktsnokkel}
            type="reforhandling"
            signal={signal}
            fallbackNavn={contract.leietaker}
            fallbackBygg={contract.bygg}
            onUpdated={onSignalUpdated}
          />
        </div>
      )}
    </div>
  );
}

function EkstraLeietakerRow({ row }: { row: ContractExpiry2026Snapshot["ekstraI2026PerLeietaker"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="truncate text-sm text-ink-1">{row.leietaker}</span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">{formatKr(row.ekstraI2026)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 border-t border-line px-3 py-2">
          {row.kontrakter.map((k) => (
            <p key={k.kontraktsnokkel} className="text-2xs text-ink-4">
              {k.bygg} ({k.kontraktsnokkel}) — utløp {formatDateDMY(k.maxSlutt)}, {formatKr(k.ekstraI2026)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractExpiry2026Block({
  snapshot,
  loading,
  signals,
  onSignalUpdated,
}: {
  snapshot: ContractExpiry2026Snapshot | null;
  loading: boolean;
  signals: TenantSignal[];
  onSignalUpdated: (next: TenantSignal) => void;
}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Kontrakter som utløper i 2026", true);
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [showEkstra, setShowEkstra] = useState(false);
  const signalsById = useMemo(() => new Map(signals.map((s) => [s.id, s])), [signals]);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    return snapshot.contracts.filter((c) => {
      if (onlyOpen && c.status !== "apen") return false;
      if (!q) return true;
      return c.leietaker.toLowerCase().includes(q) || c.bygg.toLowerCase().includes(q);
    });
  }, [snapshot, search, onlyOpen]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div id="drilldown-reforhandling" className="scroll-mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Kontrakter som utløper i 2026"
        subtitle={snapshot ? formatKr(snapshot.totalArsleie) : "…"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={CalendarClock}
        iconColorClass="text-orange-400"
      />
      {!collapsed && (
        <>
          <p className="mb-2 text-2xs text-ink-4">
            Alle kontrakter med minst én linje som utløper i kalenderåret 2026, gruppert per kontrakt. Beløpet er dagens
            årsleie — det appen kan forvente å beholde inn i 2027 dersom kontrakten fornyes uendret.
          </p>
          {snapshot && (
            <p className="mb-2 text-2xs text-ink-4">
              {snapshot.antallKontrakter} kontrakter, {formatKr(snapshot.totalArsleie)} totalt. {snapshot.antallReforhandlet}{" "}
              er allerede reforhandlet/sikret med ny kontrakt ({formatKr(snapshot.reforhandletArsleie)}) —{" "}
              {snapshot.antallApen} er fortsatt åpne og utgjør den reelle eksponeringen dersom de IKKE fornyes:{" "}
              <span className="font-medium text-ink-2">{formatKr(snapshot.reellEksponeringArsleie)}</span>.
            </p>
          )}
          {snapshot && (
            <div className="mb-2 rounded-xl border border-status-warning/30 bg-status-warning/5 p-3">
              <p className="text-2xs text-ink-3">
                <span className="font-semibold text-ink-1">{formatKr(snapshot.totalEkstraI2026)}</span> er IKKE med i
                prognosetotalen (685,2 mill kr) — dette er dagene fra utløpsdato til 31.12.2026 for de{" "}
                {snapshot.ekstraI2026PerLeietaker.length} leietakerne under, betinget oppside som først blir reell inntekt
                hvis kontrakten faktisk fornyes uendret.
              </p>
              <button
                type="button"
                onClick={() => setShowEkstra((v) => !v)}
                className="mt-1.5 text-2xs font-medium text-accent hover:text-accent/80"
              >
                {showEkstra ? "Skjul liste pr. leietaker" : "Vis liste pr. leietaker"}
              </button>
              {showEkstra && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {snapshot.ekstraI2026PerLeietaker.map((p) => (
                    <EkstraLeietakerRow key={p.leietaker} row={p} />
                  ))}
                </div>
              )}
            </div>
          )}
          <a
            href="/api/income-forecast/contract-expiry-2026/export"
            className="mb-2 inline-block text-2xs font-medium text-accent hover:text-accent/80"
          >
            Eksporter til Excel
          </a>
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
          <label className="mb-2 flex w-fit items-center gap-1.5 text-2xs text-ink-3">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => {
                setOnlyOpen(e.target.checked);
                setVisibleCount(30);
              }}
              className="h-3.5 w-3.5 rounded border-line-strong"
            />
            Vis kun åpne (ikke reforhandlet)
          </label>
          {loading ? (
            <SkeletonRows count={4} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen kontrakter funnet.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {visible.map((c) => (
                  <ContractExpiryRow
                    key={`${c.leietaker}||${c.kontraktsnokkel}`}
                    contract={c}
                    signal={signalsById.get(c.kontraktsnokkel)}
                    onSignalUpdated={onSignalUpdated}
                  />
                ))}
              </div>
              {filtered.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 30)}
                  className="mt-2 w-full rounded-xl border border-dashed border-line py-2 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                >
                  Vis {Math.min(30, filtered.length - visible.length)} til ({filtered.length - visible.length} gjenstår)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ManualNxtBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Manuelle poster i NXT", true);
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Manuelle poster allerede i NXT"
        subtitle={`${MANUAL_NXT.vouchers.length} bilag`}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <p className="mb-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-4">
          Ren historikk/kontekst siden 2026-08-30 - IKKE lenger lagt til i "Bokført" (se "Bokført totalt, konto
          3600-3699" over). Disse bilagene er allerede inkludert der, siden periodesaldoen NXT bruker teller alt
          uansett opprinnelse (bekreftet direkte mot NXT for avsetningsposten under) - en egen addering her hadde
          dobbelttalt dem.
        </p>
      )}
      {!collapsed &&
        (MANUAL_NXT.vouchers.length === 0 ? (
          <p className="text-sm text-ink-3">Ingen bilag registrert ennå.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {MANUAL_NXT.vouchers.map((v) => (
              <li key={v.bilagsnr} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm text-ink-1">{v.tekst}</p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-1">{formatKr(v.belop)}</p>
                </div>
                <p className="mt-0.5 text-2xs text-ink-4">
                  Bilag {v.bilagsnr} · {formatDateDMY(v.dato)} · konto {v.konto} · {v.bygg} · {v.kategori} · Del {v.del}
                </p>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function OwnershipShareBlock() {
  if (OWNERSHIP_SHARE_RULES.rules.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-status-warning/30 bg-status-warning/5 p-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-status-warning">Eierandel — spesialregler</p>
      <p className="text-2xs text-ink-4">
        Disse byggene er deleid — kun Mustads eierandel av inntekten skal telle i den endelige prognosen. Både
        &quot;Gjenstår å fakturere&quot; (Fazile) og &quot;Fakturert hittil&quot; (NXT) har dette korrekt bakt inn
        (verifisert og korrigert 2026-08-24) — se avstemmingskontrollene under.
      </p>
      <ul className="flex flex-col gap-1">
        {OWNERSHIP_SHARE_RULES.rules.map((r) => (
          <li key={r.bygg} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-2">{r.bygg}</span>
            <span className="font-medium tabular-nums text-ink-1">{r.andelProsent}% av inntekten</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReconciliationPanel() {
  if (RECONCILIATION.checks.length === 0) {
    return <p className="text-sm text-ink-3">Ingen avstemmingskontroller kjørt ennå.</p>;
  }
  return (
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
  );
}

const POTENTIAL_CATEGORY_LABEL: Record<PotentialIncomeCategoryKey, string> = {
  "potensiell-fremtidig-inntekt": "Potensiell fremtidig inntekt",
  "ledige-lokaler": "Potensiell inntekt: ledige lokaler",
  annet: "Potensiell inntekt: annet",
};

function SummaryTile({
  label,
  belop,
  jumpToId,
  emphasize,
}: {
  label: string;
  belop: number;
  jumpToId?: string;
  emphasize?: boolean;
}) {
  const content = (
    <>
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{label}</p>
      <p className={`mt-1 tabular-nums text-ink-1 ${emphasize ? "text-xl font-bold" : "text-lg font-semibold"}`}>
        {formatKr(belop)}
      </p>
    </>
  );
  const className = `rounded-xl border px-3 py-2.5 text-left transition ${
    emphasize ? "border-2 border-line-strong bg-surface-2" : "border-line bg-surface-2 hover:border-line-strong"
  }`;
  if (!jumpToId) {
    return <div className={className}>{content}</div>;
  }
  return (
    <a href={`#${jumpToId}`} className={className}>
      {content}
      <p className="mt-1 text-2xs text-accent">Se detalj ↓</p>
    </a>
  );
}

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
  const result = new Map<string, number>();
  if (!snapshot) return result;
  const signalsById = new Map(signals.map((s) => [s.id, s]));
  for (const c of snapshot.contracts) {
    if (c.status !== "apen") continue;
    const sannsynlighet = signalsById.get(c.kontraktsnokkel)?.sannsynlighetProsent ?? 100;
    const key = c.leietaker.trim().toLowerCase();
    result.set(key, (result.get(key) ?? 0) + c.ekstraI2026 * (sannsynlighet / 100));
  }
  return result;
}

function MainForecastBox({
  rollup,
  contractExpiry2026,
  omsetningsavregning,
  potential,
  tenantSignals,
  onPotentialUpdated,
}: {
  rollup: ForecastRollup;
  contractExpiry2026: ContractExpiry2026Snapshot | null;
  omsetningsavregning: OmsetningsavregningSnapshot | null;
  potential: PotentialIncomeSnapshot | null;
  tenantSignals: TenantSignal[];
  onPotentialUpdated: (next: PotentialIncomeSnapshot["categories"][number]) => void;
}) {
  const [open, setOpen] = useState(false);

  const bokfort =
    rollup.delA.fakturertHittil +
    rollup.delB.fakturertHittil +
    rollup.delA.manueltNxtHittil +
    rollup.delB.manueltNxtHittil +
    rollup.delA.manuelleLinjer +
    rollup.delB.manuelleLinjer;
  const gjenstar = rollup.delA.gjenstaende + rollup.delB.gjenstaende;
  // v2 (2026-08-29): RETTET - viste tidligere `contractExpiry2026?.totalEkstraI2026` direkte, et
  // tall som antar 100 % sannsynlighet for ALLE åpne kontrakter uansett hva Morten faktisk har
  // satt pr. kontrakt i "Kontrakter på utløp" (Prognose-fanen). Bruker nå samme sannsynlighets-
  // vektede beregning som den seksjonen selv viser - de to skal ALLTID vise samme tall.
  const reforhandlingFull = beregnVektetReforhandlingTotal(contractExpiry2026, tenantSignals);
  // NYTT 2026-08-30 (Morten: "et eget punkt ... hva den potensielle ekstrainntekten kan bli hvis
  // alle reforhandles til samme vilkår") - samler ALLE åpne (ikke reforhandlede) kontrakter på
  // 36-serien som utløper i 2026, og viser hva de ville gitt i ekstra 2026-inntekt HVIS alle ble
  // reforhandlet til akkurat samme vilkår som i dag (dvs. sluttdato = 31.12.2026 eller senere) -
  // 100 %-scenario, IKKE sannsynlighetsvektet (det er "Reforhandling"-linjen over).
  // BEVISST IKKE lagt til `total` under - dette er et øvre-grense-scenario for referanse, ikke et
  // sannsynlighetsjustert bidrag til selve prognosen (som ville dobbelttalt mot linjen over).
  const potensiellEkstrainntektReforhandling100 = contractExpiry2026?.totalEkstraI2026 ?? 0;
  const omsetningsavregningSum = omsetningsavregning?.totalEkstrafakturering ?? 0;
  const potentialByKey = new Map((potential?.categories ?? []).map((c) => [c.key, c]));
  const potensiellFremtidig = potentialByKey.get("potensiell-fremtidig-inntekt")?.belop ?? 0;
  const ledigeLokaler = potentialByKey.get("ledige-lokaler")?.belop ?? 0;
  const annet = potentialByKey.get("annet")?.belop ?? 0;
  const total = bokfort + gjenstar + reforhandlingFull + omsetningsavregningSum + potensiellFremtidig + ledigeLokaler + annet;

  return (
    <div className="rounded-2xl border-2 border-line-strong bg-surface-2 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-1 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-4">Inntektsprognose 2026</p>
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-4" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-4" />}
        </div>
        <p className="text-3xl font-bold tabular-nums text-ink-1">{formatKr(total)}</p>
        {!open && <p className="text-2xs text-accent">Se breakdown ↓</p>}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-2">Bokført</span>
            <span className="font-medium tabular-nums text-ink-1">{formatKr(bokfort)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-2">Gjenstår</span>
            <span className="font-medium tabular-nums text-ink-1">{formatKr(gjenstar)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-2">Omsetningsavregning</span>
            <span className="font-medium tabular-nums text-ink-1">{formatKr(omsetningsavregningSum)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-1 text-ink-2">
              Reforhandlingsmuligheter
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label="Om reforhandlingsmuligheter" className="shrink-0 text-ink-4 hover:text-ink-1">
                      <Info className="h-3 w-3" />
                    </button>
                  }
                />
                <TooltipContent>
                  Vektet med sannsynligheten du har satt pr. kontrakt i "Kontrakter på utløp" (Prognose-fanen) - endres
                  der, endres tallet her automatisk. Øvre grense (100 % sannsynlighet på alle åpne kontrakter på
                  36-serien som utløper i 2026): {formatKr(potensiellEkstrainntektReforhandling100)} - IKKE i totalen,
                  kun til referanse.
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="font-medium tabular-nums text-ink-1">{formatKr(reforhandlingFull)}</span>
          </div>
          {potential?.categories
            .filter((c) => c.belop !== 0)
            .map((c) => (
              <PotentialCategoryTile key={c.key} category={c} onUpdated={onPotentialUpdated} compact />
            ))}
          <p className="mt-1 text-2xs text-ink-4">Bokført + Gjenstår er avstemt mot NXT/Fazile.</p>
        </div>
      )}
    </div>
  );
}

// Delt mellom TenantDrilldown (Leieinntekter) og LedigeLokalerBlock (den dedikerte "Ledige
// lokaler"-oversikten) - samme leietaker-liste vises begge steder, kun via ulik inngang.
// v8 (2026-08-29): egne "label: verdi"-par pr. tall i stedet for én lang flex-rad - den forrige
// varianten fløt fritt og overlappet/klippet av på smale mobilskjermer (Morten viste skjermbilde
// av dette 2026-08-29). Budsjett-tallet her er nøyaktig det samme beløpet som er trukket fra
// Ledig-radens "Trukket ut"-sum lenger opp - eksplisitt sagt i teksten, ikke bare underforstått.
function FlyttetInnListe({ flyttetInn }: { flyttetInn: TenantForecastRow[] }) {
  if (flyttetInn.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-line-strong pt-1.5">
      <p className="text-2xs font-medium text-ink-3">
        Flyttet inn her <span className="font-normal text-ink-4">— budsjettet under er beløpet trukket ut over</span>
      </p>
      <div className="flex flex-col gap-1.5">
        {flyttetInn.map((t) => (
          <div key={t.navn} className="rounded-lg bg-surface-2/60 px-2 py-1.5">
            <p className="truncate text-2xs font-medium text-ink-1">{t.navn}</p>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-2xs tabular-nums">
              <span className="text-ink-4">
                Budsjett <span className="text-ink-2">{formatKr(t.budsjett ?? 0)}</span>
              </span>
              <span className="text-ink-4">
                Fakturert <span className="text-ink-2">{formatKr(t.fakturert)}</span>
              </span>
              <span className="text-ink-4">
                Gjenstår <span className="text-ink-2">{formatKr(t.gjenstar)}</span>
              </span>
              <span className="text-ink-4">
                +/-{" "}
                <span className={t.avvik === null ? "text-ink-4" : t.avvik >= 0 ? "text-status-positive" : "text-status-danger"}>
                  {t.avvik === null ? "—" : formatKr(t.avvik, true)}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// v3 (2026-08-29, Morten: "vist kontoer og så fakturert pr konto (alignes under kolonnen
// Fakturert), så linjer fra Fazile og gjenstår å fakturere (aligned under den kolonnen)") -
// erstatter den forrige enkle linjelisten (som viste Fazile sin kontraktsfestede ÅRSVERDI, ikke
// hva som faktisk gjensto) med to side-om-side seksjoner som speiler foreldreraden sine to
// tallkolonner: NXT-kontoer -> Fakturert (venstre), Fazile-linjer -> Gjenstår (høyre, med
// gjenstår proporsjonalt fordelt over linjene - se gjenstarShare i build-tenant-forecast-table.js).
function TenantDrilldown({ row, flyttetInn = [] }: { row: TenantForecastRow; flyttetInn?: TenantForecastRow[] }) {
  const kontoer = row.kontoer ?? [];
  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface-1 px-3 py-2.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Konto → Fakturert</p>
          {kontoer.length === 0 ? (
            <p className="text-2xs text-ink-4">Ingen NXT-postering funnet.</p>
          ) : (
            kontoer.map((k) => (
              <div key={k.konto} className="flex items-baseline justify-between gap-2 text-2xs text-ink-3">
                <span className="truncate">{k.konto}</span>
                <span className="shrink-0 tabular-nums text-ink-4">{formatKr(k.belop)}</span>
              </div>
            ))
          )}
          <div className="flex items-baseline justify-between gap-2 border-t border-line-strong pt-1 text-sm">
            <span className="text-ink-2">Fakturert</span>
            <span className="font-semibold tabular-nums text-ink-1">{formatKr(row.fakturert)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" className="flex items-center gap-1 text-left" onClick={(e) => e.stopPropagation()}>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Fazile-linje → Gjenstår (estimat)</p>
                  <Info className="h-3 w-3 shrink-0 text-ink-4" />
                </button>
              }
            />
            <TooltipContent>
              REMAINING har kun gjenstår pr. bygg, ikke pr. kontraktslinje - beløpet under er byggets
              samlede gjenstår fordelt proporsjonalt på hver linjes andel av årsleien, IKKE et ekte tall
              hentet fra Fazile. Fazile har et eget, mer presist per-linje-tall (via fakturahistorikk),
              men det er per 2026-08-29/30 upålitelig for perioder før ca. 20. januar 2026 pga. en
              kjent migreringsartefakt (kontraktslinje-ID-er ble regenerert 15.-20. januar 2026) - derfor
              ikke tatt i bruk ennå. Summen nederst stemmer alltid med Gjenstår-kolonnen i tabellen over.
            </TooltipContent>
          </Tooltip>
          {row.linjer.length === 0 ? (
            <p className="text-2xs text-ink-4">Ingen kontraktslinjer registrert.</p>
          ) : (
            row.linjer.map((l, i) => (
              <div key={`${l.bygg}-${l.beskrivelse}-${i}`} className="flex items-baseline justify-between gap-2 text-2xs text-ink-3">
                <span className="truncate">
                  {l.leietaker ? `${l.leietaker} — ` : ""}
                  {l.bygg ? `${l.bygg} — ` : ""}
                  {l.beskrivelse}
                  {l.linjetype ? ` (${l.linjetype})` : ""}
                </span>
                {/* gjenstarShare er kun satt for ekte leietaker-rader (buildLeietakerMap()) -
                    andre gjenbrukere av TenantDrilldown (f.eks. Ledige lokaler sine areal-linjer)
                    har ikke dette feltet og faller tilbake til linjens fulle årsverdi/budsjett. */}
                <span className="shrink-0 tabular-nums text-ink-4">{formatKr(l.gjenstarShare ?? l.fullArsverdi2026)}</span>
              </div>
            ))
          )}
          <div className="flex items-baseline justify-between gap-2 border-t border-line-strong pt-1 text-sm">
            <span className="text-ink-2">Gjenstår</span>
            <span className="font-semibold tabular-nums text-ink-1">{formatKr(row.gjenstar)}</span>
          </div>
        </div>
      </div>
      <FlyttetInnListe flyttetInn={flyttetInn} />
      {row.kommentar && <p className="rounded-lg bg-surface-2 px-2 py-1.5 text-2xs text-ink-3">{row.kommentar}</p>}
      <div className="flex items-baseline justify-between gap-2 border-t border-line-strong pt-1.5 text-sm">
        <span className="text-ink-2">+/- vs. budsjett</span>
        <span
          className={`font-semibold tabular-nums ${
            row.avvik === null ? "text-ink-4" : row.avvik >= 0 ? "text-status-positive" : "text-status-danger"
          }`}
        >
          {row.avvik === null ? "—" : formatKr(row.avvik, true)}
        </span>
      </div>
    </div>
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
    if (l.startDato && l.startDato >= "2026-01-01" && l.startDato <= "2026-12-31") {
      if (!start || l.startDato < start) {
        start = l.startDato;
        startLinje = l;
      }
    }
    if (l.sluttDato && l.sluttDato >= "2026-01-01" && l.sluttDato <= "2026-12-31") {
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
function KommentarCell({ navn, value, onSave }: { navn: string; value: string; onSave: (navn: string, value: string) => void }) {
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
            className="block w-full max-w-[180px] truncate rounded-md border border-transparent px-1.5 py-1 text-left text-2xs text-ink-2 outline-none transition hover:border-line hover:bg-surface-2"
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

type LedigeLokalerSortKey = "navn" | "opprinnelig" | "trukketUt" | "gjenstaende" | "avvik";

// Dedikert oversikt over "Ledig <kortkode>"-radene + hvem som har flyttet inn i dem, samlet ett
// sted (Morten, 2026-08-29) - i TILLEGG til (ikke erstatning for) at de samme radene/leietakerne
// fortsatt vises som normalt i Leieinntekter-tabellen over. Leser samme delA.leietaker-array,
// ingen egen Redis-pipeline.
function LedigeLokalerBlock({ rows }: { rows: TenantForecastRow[] }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Ledige lokaler", true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [commentOverrides, setCommentOverrides] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: LedigeLokalerSortKey; dir: 1 | -1 }>({ key: "trukketUt", dir: -1 });

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

  const flyttetInnByLedigNavn = useMemo(() => {
    const m = new Map<string, TenantForecastRow[]>();
    for (const r of rows) {
      if (!r.flyttetInnI) continue;
      if (!m.has(r.flyttetInnI)) m.set(r.flyttetInnI, []);
      m.get(r.flyttetInnI)!.push(r);
    }
    return m;
  }, [rows]);

  const ledigRows = useMemo(() => rows.filter((r) => r.navn.startsWith("Ledig")), [rows]);

  const derivedAll = useMemo(
    () =>
      ledigRows.map((row) => ({
        row,
        flyttetInn: flyttetInnByLedigNavn.get(row.navn) ?? [],
        opprinnelig: row.ledigOpprinneligBudsjett ?? row.budsjett ?? 0,
        trukketUt: row.ledigTrukketUt ?? 0,
        gjenstaende: row.budsjett ?? 0,
        avvik: row.avvik ?? 0,
      })),
    [ledigRows, flyttetInnByLedigNavn],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return derivedAll;
    return derivedAll.filter((d) => d.row.navn.toLowerCase().includes(q) || d.flyttetInn.some((t) => t.navn.toLowerCase().includes(q)));
  }, [derivedAll, search]);

  function toggleSort(key: LedigeLokalerSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: (prev.dir * -1) as 1 | -1 } : { key, dir: key === "navn" ? 1 : -1 }));
  }

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => (key === "navn" ? a.row.navn.localeCompare(b.row.navn, "nb-NO") * dir : (a[key] - b[key]) * dir));
  }, [filtered, sort]);

  const visible = sorted.slice(0, visibleCount);

  function toggle(navn: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(navn)) next.delete(navn);
      else next.add(navn);
      return next;
    });
  }

  function headerButton(label: string, key: LedigeLokalerSortKey) {
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

  const totalOpprinnelig = derivedAll.reduce((s, d) => s + d.opprinnelig, 0);
  const totalTrukketUt = derivedAll.reduce((s, d) => s + d.trukketUt, 0);
  const totalGjenstaende = derivedAll.reduce((s, d) => s + d.gjenstaende, 0);
  const totalAvvik = derivedAll.reduce((s, d) => s + d.avvik, 0);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Ledige lokaler"
        subtitle={`${formatKr(totalGjenstaende)} gjenstår`}
        alwaysShowSubtitle
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={DoorOpen}
        iconColorClass="text-status-warning"
      />
      {!collapsed && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(20);
              }}
              placeholder="Søk bygg eller innflyttet leietaker…"
              className="w-full bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
            />
          </div>
          {ledigRows.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen ledige lokaler i denne kategorien.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-ink-4">
                    <th className="px-3 py-2">{headerButton("Ledig", "navn")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("Opprinnelig", "opprinnelig")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("Trukket ut", "trukketUt")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("Gjenstående", "gjenstaende")}</th>
                    <th className="px-3 py-2 text-right">{headerButton("+/-", "avvik")}</th>
                    <th className="px-3 py-2 text-left">Kommentar</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => {
                    const isOpen = expanded.has(d.row.navn);
                    return (
                      <Fragment key={d.row.navn}>
                        <tr
                          className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50"
                          onClick={() => toggle(d.row.navn)}
                        >
                          <td className="max-w-[140px] truncate px-3 py-2 text-ink-1">{d.row.navn}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(d.opprinnelig)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{d.trukketUt === 0 ? "—" : formatKr(d.trukketUt)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(d.gjenstaende)}</td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${
                              d.avvik >= 0 ? "text-status-positive" : "text-status-danger"
                            }`}
                          >
                            {formatKr(d.avvik, true)}
                          </td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <KommentarCell navn={d.row.navn} value={commentOverrides[d.row.navn] ?? d.row.kommentar ?? ""} onSave={saveComment} />
                          </td>
                        </tr>
                        {isOpen && d.flyttetInn.length > 0 && (
                          <>
                            <tr className="border-t border-line-strong bg-surface-2/40">
                              <td colSpan={6} className="px-3 py-1 text-2xs font-medium text-ink-3">
                                Flyttet inn her — beløpet er leietakerens eget fakturert+gjenstår fra Leieinntekter (samme tall, ikke egne beregninger)
                              </td>
                            </tr>
                            {d.flyttetInn.map((t) => (
                              <tr key={t.navn} className="border-t border-line">
                                <td className="max-w-[140px] truncate px-3 py-1.5 pl-6 text-ink-2">
                                  <span className="text-ink-4">↳ </span>
                                  {t.navn}
                                </td>
                                <td className="px-3 py-1.5 text-right text-ink-4">—</td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-ink-2">{formatKr(t.fakturert + t.gjenstar)}</td>
                                <td className="px-3 py-1.5 text-right text-ink-4">—</td>
                                <td className="px-3 py-1.5 text-right text-ink-4">—</td>
                                <td className="px-3 py-1.5" />
                              </tr>
                            ))}
                          </>
                        )}
                        {isOpen && (
                          <tr className="border-t border-line">
                            <td colSpan={6} className="p-0">
                              <TenantDrilldown row={d.row} flyttetInn={[]} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong font-semibold">
                    <td className="px-3 py-2 text-ink-1">Totalt ({derivedAll.length})</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalOpprinnelig)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalTrukketUt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalGjenstaende)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${totalAvvik >= 0 ? "text-status-positive" : "text-status-danger"}`}>
                      {formatKr(totalAvvik, true)}
                    </td>
                    <td className="px-3 py-2" />
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
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Kontrakter på utløp"
        subtitle={snapshot ? formatKr(snapshot.totalEkstraI2026) : "Laster…"}
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
            <p className="text-sm text-ink-3">Ingen åpne kontrakter utløper i 2026.</p>
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

const GRUPPERING_LABEL: Record<TenantForecastGruppering, string> = { leietaker: "Leietaker", bygg: "Bygg", leietype: "Leietype" };
const GRUPPERINGER: TenantForecastGruppering[] = ["leietaker", "bygg", "leietype"];
const EMPTY_GRUPPER: TenantForecastGrupper = { leietaker: [], bygg: [], leietype: [] };

function TenantForecastTable({
  title,
  grupper,
  totalBudsjettOverride,
  reforhandlingByNavn,
}: {
  title: string;
  grupper: TenantForecastGrupper;
  // Kun satt for Parkering: budsjettert som ÉN totallinje i kildefila, ikke pr. leietaker/bygg/
  // leietype (Morten 2026-08-26) - når satt, vises Totalt-radens budsjett/+/- mot denne
  // verdien i stedet for sum av (alltid null) pr.-rad-budsjett.
  totalBudsjettOverride?: number;
  // Kun satt for Leieinntekter (delA) - samme Map som KontrakterPaUtlopBlock bruker, slik at en
  // leietaker med en åpen kontrakt som utløper i 2026 viser SAMME Gjenstår/+/- her som i
  // "Kontrakter på utløp" for den valgte reforhandlingssannsynligheten, i stedet for at Gjenstår
  // her alltid forutsetter at leieforholdet tar slutt på kontraktens registrerte sluttdato
  // (Morten 2026-08-29: "det man velger under kontrakter på utløp reflekteres fortsatt ikke opp
  // i leieinntekter"). Kun meningsfull ved leietaker-gruppering (Map er navnebasert).
  reforhandlingByNavn?: Map<string, number>;
}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse(`Inntektsprognose: ${title}`, true);
  const [gruppering, setGruppering] = useState<TenantForecastGruppering>("leietaker");
  const rawRows = grupper[gruppering];
  // Justerer gjenstår/avvik pr. leietaker-rad med samme sannsynlighetsvektede
  // "ekstraVedReforhandling"-sum som "Kontrakter på utløp" viser - se
  // beregnEkstraVedReforhandlingByNavn(). Ingen justering ved bygg-/leietype-gruppering (Map er
  // navnebasert) eller for leietakere uten en åpen 2026-kontrakt i snapshotet.
  const rows: DisplayTenantRow[] = useMemo(() => {
    if (gruppering !== "leietaker" || !reforhandlingByNavn || reforhandlingByNavn.size === 0) return rawRows;
    return rawRows.map((r): DisplayTenantRow => {
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
  }, [rawRows, gruppering, reforhandlingByNavn]);
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
    if (!q) return rows;
    return rows.filter((r) => r.navn.toLowerCase().includes(q));
  }, [rows, search]);

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

  function headerButton(label: string, key: "navn" | "fakturert" | "gjenstar" | "budsjett" | "avvik") {
    const active = sort?.key === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-0.5 text-2xs font-medium transition hover:text-ink-1 ${active ? "text-ink-1" : "text-ink-4"}`}
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
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
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
      <p className="text-2xs text-ink-4">
        {filtered.length !== rows.length && !search.trim() ? `${filtered.length} av ${rows.length} rader` : `${rows.length} rader`}
      </p>
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
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2">{headerButton(GRUPPERING_LABEL[gruppering], "navn")}</th>
                {gruppering === "leietaker" && <th className="whitespace-nowrap px-3 py-2 text-left text-2xs font-medium text-ink-4">Start/slutt 2026</th>}
                <th className="px-3 py-2 text-right">{headerButton("Fakturert", "fakturert")}</th>
                <th className="px-3 py-2 text-right">{headerButton("Gjenstår", "gjenstar")}</th>
                <th className="px-3 py-2 text-right">{headerButton("Budsjett", "budsjett")}</th>
                <th className="px-3 py-2 text-right">{headerButton("+/-", "avvik")}</th>
                {gruppering === "leietaker" && <th className="px-3 py-2 text-left">Kommentar</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const isOpen = expanded.has(row.navn);
                return (
                  <Fragment key={row.navn}>
                    <tr
                      className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50"
                      onClick={() => toggle(row.navn)}
                    >
                      <td className="max-w-[160px] px-3 py-2 text-ink-1">
                        <span className="flex min-w-0 items-center gap-1">
                          {row.internleie ? (
                            <span className="min-w-0 truncate text-ink-3">{row.navn}</span>
                          ) : (
                            <span className="min-w-0 truncate">{row.navn}</span>
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
                          {gruppering === "leietaker" && (commentOverrides[row.navn] ?? row.kommentar) && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Har kommentar"
                                    className="shrink-0 text-accent hover:text-ink-1"
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </button>
                                }
                              />
                              <TooltipContent>{commentOverrides[row.navn] ?? row.kommentar}</TooltipContent>
                            </Tooltip>
                          )}
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
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.internleie ? "text-ink-3" : "text-ink-2"}`}>
                        {formatKr(row.fakturert)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.internleie ? "text-ink-3" : "text-ink-2"}`}>
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
                                Inkluderer {formatKr(row._reforhandlingsjustering, true)} fra "Kontrakter på utløp" - valgt
                                reforhandlingssannsynlighet for denne leietakerens utløpende kontrakt(er).
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.internleie ? "text-ink-3" : "text-ink-2"}`}>
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
                          <KommentarCell navn={row.navn} value={commentOverrides[row.navn] ?? row.kommentar ?? ""} onSave={saveComment} />
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-line">
                        <td colSpan={gruppering === "leietaker" ? 7 : 5} className="p-0">
                          <TenantDrilldown row={row} flyttetInn={flyttetInnByLedigNavn.get(row.navn) ?? []} />
                        </td>
                      </tr>
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

// "manueltNxtHittil" er bevisst utelatt her (OPPDATERT 2026-08-30) - feltet holdes på 0 siden
// manuelt bokførte NXT-bilag nå inngår i "Fakturert hittil (NXT)" (BOOKED_3600_3699 sin
// periodesaldo teller alt uansett opprinnelse), se kommentaren på PartTotals i
// lib/incomeForecastCompute.ts. En egen rad her ville bare vist 0 kr på begge deler.
const ROLLUP_ROWS: { label: string; key: keyof PartTotals }[] = [
  { label: "Fakturert hittil (NXT)", key: "fakturertHittil" },
  { label: "Gjenstår å fakturere", key: "gjenstaende" },
  { label: "Mine manuelle linjer (aktive)", key: "manuelleLinjer" },
];

function PartTile({ label, totals }: { label: string; totals: PartTotals }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink-1">{formatKr(totals.totalt)}</p>
    </div>
  );
}

function ForecastSummaryBlock({ rollup }: { rollup: ForecastRollup }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <PartTile label="Del A — leie" totals={rollup.delA} />
        <PartTile label="Del B — parkering" totals={rollup.delB} />
        <div className="rounded-xl border-2 border-line-strong bg-surface-2 px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Prognose totalt</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-ink-1">{formatKr(rollup.totalt)}</p>
        </div>
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-ink-4">
              <th className="px-3 py-2 text-2xs font-medium">Komponent</th>
              <th className="px-3 py-2 text-right text-2xs font-medium">Del A</th>
              <th className="px-3 py-2 text-right text-2xs font-medium">Del B</th>
              <th className="px-3 py-2 text-right text-2xs font-medium">Totalt</th>
            </tr>
          </thead>
          <tbody>
            {ROLLUP_ROWS.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-3 py-2 text-ink-2">{row.label}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(rollup.delA[row.key])}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(rollup.delB[row.key])}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-ink-1">
                  {formatKr(rollup.delA[row.key] + rollup.delB[row.key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
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
  const [activeTab, setActiveTab] = useState<"prognose" | "tillegg">("prognose");

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
  const ekstraVedReforhandlingByNavn = useMemo(
    () => beregnEkstraVedReforhandlingByNavn(contractExpiry2026, tenantSignals),
    [contractExpiry2026, tenantSignals],
  );

  return (
    <div className="border-t-2 border-t-yellow-400/60 p-4">
      <CardHeader
        title="Inntektsprognose 2026"
        subtitle={
          <>
            {formatKr(rollup.totalt)}
            {lastUpdated ? ` · sist oppdatert ${formatDateDMY(lastUpdated)}` : " · ingen data ennå"}
          </>
        }
        icon={TrendingUp}
        iconColorClass="text-yellow-400"
      />
      <div className="flex flex-col gap-5">
          <p className="-mt-2 text-2xs text-ink-4">
            Øyeblikksbilde — avstemt manuelt mot Visma NXT og Fazile, oppdateres ved forespørsel. Ikke en live-integrasjon.
          </p>

          <div className="flex w-fit gap-1 rounded-xl bg-surface-2 p-1">
            {(["prognose", "tillegg"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === tab ? "bg-accent text-white" : "text-ink-3 hover:text-ink-1"
                }`}
              >
                {tab === "prognose" ? "Prognose" : "Tillegg"}
              </button>
            ))}
          </div>

          {activeTab === "prognose" ? (
            <>
              <MainForecastBox
                rollup={rollup}
                contractExpiry2026={contractExpiry2026}
                omsetningsavregning={omsetningsavregning}
                potential={potential}
                tenantSignals={tenantSignals}
                onPotentialUpdated={handlePotentialUpdated}
              />

              <TenantForecastTable
                title="Leieinntekter"
                grupper={tenantForecastTable?.delA ?? EMPTY_GRUPPER}
                reforhandlingByNavn={ekstraVedReforhandlingByNavn}
              />
              <TenantForecastTable
                title="Parkering"
                grupper={tenantForecastTable?.delB ?? EMPTY_GRUPPER}
                totalBudsjettOverride={tenantForecastTable?.delBBudsjettTotal}
              />
              <OmsetningsavregningBlock snapshot={omsetningsavregning} loading={loadingOmsetningsavregning} />
              <KontrakterPaUtlopBlock
                snapshot={contractExpiry2026}
                loading={loadingContractExpiry2026}
                signals={tenantSignals}
                onSignalUpdated={handleSignalUpdated}
                leietakerRader={tenantForecastTable?.delA.leietaker ?? []}
              />
              <LedigeLokalerBlock rows={tenantForecastTable?.delA.leietaker ?? []} />
            </>
          ) : (
            <>
              <ForecastSummaryBlock rollup={rollup} />

              <OwnershipShareBlock />

              <div className="flex flex-col gap-1.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Avstemmingskontroller</p>
                <ReconciliationPanel />
              </div>

              <InvoicedBlock />
              <BookedAccountRangeBlock />
              <NxtBudgetBlock rollup={rollup} />
              <BookedTenantsBlock />
              <RemainingBlock />
              <LeietypeBreakdownBlock />
              <VacantAreasBlock />
              <RemainingTenantsFullBlock />
              <LeieforholdReviewBlock />
              <ContractExpiry2026Block
                snapshot={contractExpiry2026}
                loading={loadingContractExpiry2026}
                signals={tenantSignals}
                onSignalUpdated={handleSignalUpdated}
              />
              <ManualNxtBlock />

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
            </>
          )}
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
