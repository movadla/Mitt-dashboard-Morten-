"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Search, TrendingUp, Users, XCircle } from "lucide-react";
import { CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "./CardShell";
import { formatDateDMY, formatKr } from "@/lib/widgets";
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
                <td className="px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalA)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(totalB)}</td>
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
            Steg 1 av flere — bygg-nedbrytning vist under per selskap, leietaker-nedbrytning kommer i en senere runde.
            Rent kontrollstørrelse, ikke lagt inn i prognosetotalen under.
          </p>
          <p className="mb-2 text-2xs text-ink-4">
            Differanse mot INVOICED (periode 1-8): <span className="font-medium tabular-nums text-ink-2">{formatKr(diff)}</span> — forventet, forklares
            av forhåndsfakturerte poster i periode 9-12 som allerede er bokført.
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
                  <td className="px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(BOOKED_3600_3699.totalBelop)}</td>
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
                      <td className="px-3 py-2 text-right tabular-nums text-ink-1">{formatKr(snapshot.totalBelop)}</td>
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
  "intern-mustad": "Intern (Mustad selv)",
};

const BYGG_STATUS_STYLE: Record<string, string> = {
  ok: "bg-surface-3 text-ink-3",
  avsluttet: "bg-status-danger/12 text-status-danger",
  "ikke-matchet-i-nxt": "bg-accent/15 text-accent",
  "forklart-omsetningsleie": "bg-status-warning/15 text-status-warning",
  "forklart-kontraktsendring": "bg-status-warning/15 text-status-warning",
  "intern-mustad": "bg-surface-3 text-ink-4",
};

const REVIEW_STATUSES = [
  "ikke-matchet-i-nxt",
  "forklart-omsetningsleie",
  "forklart-kontraktsendring",
  "avsluttet",
  "intern-mustad",
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
  omsetningsavregning: "Potensiell inntekt: omsetningsavregning",
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
}: {
  category: PotentialIncomeSnapshot["categories"][number];
  onUpdated: (next: PotentialIncomeSnapshot["categories"][number]) => void;
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

function TopSummaryBlock({
  rollup,
  contractExpiry2026,
  potential,
  onPotentialUpdated,
  tenantSignals,
}: {
  rollup: ForecastRollup;
  contractExpiry2026: ContractExpiry2026Snapshot | null;
  potential: PotentialIncomeSnapshot | null;
  onPotentialUpdated: (next: PotentialIncomeSnapshot["categories"][number]) => void;
  tenantSignals: TenantSignal[];
}) {
  const bokfort =
    rollup.delA.fakturertHittil +
    rollup.delB.fakturertHittil +
    rollup.delA.manueltNxtHittil +
    rollup.delB.manueltNxtHittil +
    rollup.delA.manuelleLinjer +
    rollup.delB.manuelleLinjer;
  const gjenstar = rollup.delA.gjenstaende + rollup.delB.gjenstaende;
  const reforhandlingFull = contractExpiry2026?.totalEkstraI2026 ?? 0;

  // Sannsynlighetsvektet forventningsverdi (Morten, 2026-08-24) i stedet for full verdi -
  // leieforhold uten satt sannsynlighet telles med 0 %, ikke full verdi, til Morten har
  // vurdert dem (se lib/tenantSignals.ts).
  const signalsById = useMemo(() => new Map(tenantSignals.map((s) => [s.id, s])), [tenantSignals]);
  const reforhandlingVektet = useMemo(() => {
    if (!contractExpiry2026) return 0;
    return contractExpiry2026.contracts.reduce((sum, c) => {
      if (c.ekstraI2026 <= 0) return sum;
      const signal = signalsById.get(c.kontraktsnokkel);
      const sannsynlighet = signal ? signal.sannsynlighetProsent / 100 : 0;
      return sum + c.ekstraI2026 * sannsynlighet;
    }, 0);
  }, [contractExpiry2026, signalsById]);
  const snittSannsynlighet = reforhandlingFull > 0 ? (reforhandlingVektet / reforhandlingFull) * 100 : 0;

  const potentialSum = potential ? potential.categories.reduce((s, c) => s + c.belop, 0) : 0;
  const total = rollup.totalt + reforhandlingVektet + potentialSum;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SummaryTile label="Bokført" belop={bokfort} jumpToId="drilldown-bokfort" />
        <SummaryTile label="Gjenstår å fakturere" belop={gjenstar} jumpToId="drilldown-gjenstar" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SummaryTile label="Potensiell inntekt: reforhandling" belop={reforhandlingVektet} jumpToId="drilldown-reforhandling" />
        {potential?.categories.map((c) => (
          <PotentialCategoryTile key={c.key} category={c} onUpdated={onPotentialUpdated} />
        ))}
      </div>
      <SummaryTile label="Inntektsprognose 2026" belop={total} emphasize />
      <p className="text-2xs text-ink-4">
        Bokført + Gjenstår er den delen som er avstemt mot NXT/Fazile (samme tall som lenger ned på siden). De fire
        potensial-boksene er ikke med i det tallet. Reforhandling er sannsynlighetsvektet:{" "}
        {formatKr(reforhandlingFull)} full verdi × snitt-sannsynlighet {snittSannsynlighet.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
        {" "}% = {formatKr(reforhandlingVektet)} (juster sannsynlighet pr leieforhold i kontraktsutløp-fanen under). De tre
        andre potensial-boksene er manuelle anslag du kan redigere (klikk boksen) inntil de kobles til ekte datakilder.
      </p>
    </div>
  );
}

const ROLLUP_ROWS: { label: string; key: keyof PartTotals }[] = [
  { label: "Fakturert hittil (NXT)", key: "fakturertHittil" },
  { label: "Manuelle bilag i NXT (hittil)", key: "manueltNxtHittil" },
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
                <td className="px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(rollup.delA[row.key])}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-2">{formatKr(rollup.delB[row.key])}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-ink-1">
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
        invoiced: INVOICED,
        manualNxt: MANUAL_NXT,
        remaining: REMAINING,
        manualLines: activeManualLines,
      }),
    [activeManualLines],
  );

  const lastUpdated = oldestSnapshotDate();

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

          <TopSummaryBlock
            rollup={rollup}
            contractExpiry2026={contractExpiry2026}
            potential={potential}
            onPotentialUpdated={handlePotentialUpdated}
            tenantSignals={tenantSignals}
          />

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
