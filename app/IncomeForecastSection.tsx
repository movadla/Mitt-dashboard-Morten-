"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "./CardShell";
import { formatDateDMY, formatKr } from "@/lib/widgets";
import {
  INVOICED,
  MANUAL_NXT,
  RECONCILIATION,
  REMAINING,
  type ReconciliationStatus,
  type RemainingTenantGroup,
  type RenewalCertainty,
} from "@/lib/incomeForecast";
import { computeForecastRollup, type ForecastRollup, type PartTotals } from "@/lib/incomeForecastCompute";
import type { IncomeForecastPart, ManualIncomeLine, ManualLineConfidence } from "@/lib/incomeForecastManual";
import { vibrate } from "@/lib/haptics";

const CERTAINTY_STYLE: Record<RenewalCertainty, string> = {
  sikker: "bg-status-positive/15 text-status-positive",
  usikker: "bg-status-warning/15 text-status-warning",
};

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
  const dates = [INVOICED.sistOppdatert, REMAINING.sistOppdatert, MANUAL_NXT.sistOppdatert, RECONCILIATION.sistOppdatert].filter(
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

function RemainingTenantRow({ tenant }: { tenant: RemainingTenantGroup }) {
  const [open, setOpen] = useState(false);
  const total = tenant.lines.reduce((s, l) => s + l.belopGjenstaende, 0);
  const hasUsikker = tenant.lines.some((l) => l.sikkerhet === "usikker");

  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td colSpan={4} className="p-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-left"
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
              <span className="truncate">{tenant.leietaker}</span>
              {hasUsikker && (
                <span className="shrink-0 rounded-full bg-status-warning/15 px-2 py-0.5 text-2xs font-medium text-status-warning">
                  Usikkert: fornyelse antatt
                </span>
              )}
            </span>
            <span className="whitespace-nowrap text-2xs text-ink-4">{tenant.bygg}</span>
            <span className="whitespace-nowrap tabular-nums text-ink-3">
              {tenant.lines.length} {tenant.lines.length === 1 ? "linje" : "linjer"}
            </span>
            <span className="whitespace-nowrap tabular-nums font-medium text-ink-1">{formatKr(total)}</span>
          </button>
        </td>
      </tr>
      {open &&
        tenant.lines.map((l) => (
          <tr key={l.linjeId} className="border-t border-line bg-surface-2/40">
            <td colSpan={4} className="px-3 py-2 pl-9">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="text-ink-2">
                  {l.beskrivelse}{" "}
                  <span className="text-ink-4">
                    · Del {l.del} · {formatDateDMY(l.periodeFra)}–{formatDateDMY(l.periodeTil)}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums text-2xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${CERTAINTY_STYLE[l.sikkerhet]}`}>{l.sikkerhet}</span>
                  <span className="font-medium text-ink-2">{formatKr(l.belopGjenstaende)}</span>
                </span>
              </div>
              {l.fornyelseAntatt && (
                <p className="mt-1 text-2xs text-status-warning">
                  → Fornyelse antatt til 31.12
                  {l.originalSluttdato ? ` (opprinnelig utløp ${formatDateDMY(l.originalSluttdato)})` : ""}
                </p>
              )}
              {!l.fornyelseAntatt && l.nyKontraktsnokkel && (
                <p className="mt-1 text-2xs text-status-positive">
                  → Reell etterfølgerkontrakt: {l.nyKontraktsnokkel}
                  {l.nyKontraktStart ? `, start ${formatDateDMY(l.nyKontraktStart)}` : ""}
                </p>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

function RemainingBlock() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose: Gjenstår å fakturere", true);
  const total = REMAINING.tenants.reduce((s, t) => s + t.lines.reduce((s2, l) => s2 + l.belopGjenstaende, 0), 0);
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <CardHeader
        title="Gjenstår å fakturere"
        subtitle={
          <>
            <span className="font-medium tabular-nums text-ink-2">{REMAINING.tenants.length}</span> leietakere ·{" "}
            {formatKr(total)}
          </>
        }
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed &&
        (REMAINING.tenants.length === 0 ? (
          <p className="text-sm text-ink-3">Ingen data lagt inn ennå.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-3 py-2 text-2xs font-medium">Leietaker</th>
                  <th className="px-3 py-2 text-2xs font-medium">Bygg</th>
                  <th className="px-3 py-2 text-2xs font-medium">Linjer</th>
                  <th className="px-3 py-2 text-2xs font-medium">Gjenstående</th>
                </tr>
              </thead>
              <tbody>
                {REMAINING.tenants.map((t) => (
                  <RemainingTenantRow key={t.customerId} tenant={t} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
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

const ROLLUP_ROWS: { label: string; key: keyof PartTotals }[] = [
  { label: "Fakturert hittil (NXT)", key: "fakturertHittil" },
  { label: "Manuelle bilag i NXT (hittil)", key: "manueltNxtHittil" },
  { label: "Gjenstår å fakturere — sikkert", key: "gjenstaendeSikker" },
  { label: "Gjenstår å fakturere — usikkert (fornyelse antatt)", key: "gjenstaendeUsikker" },
  { label: "Mine manuelle linjer (aktive)", key: "manuelleLinjer" },
];

function PartTile({ label, totals }: { label: string; totals: PartTotals }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink-1">{formatKr(totals.totalt)}</p>
      {totals.gjenstaendeUsikker > 0 && (
        <p className="mt-0.5 text-2xs text-status-warning">
          hvorav antatt fornyelse (usikkert): {formatKr(totals.gjenstaendeUsikker)}
        </p>
      )}
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
          {rollup.hvoravAntattFornyelse > 0 && (
            <p className="mt-0.5 text-2xs text-status-warning">
              hvorav antatt fornyelse (usikkert): {formatKr(rollup.hvoravAntattFornyelse)}
            </p>
          )}
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
        autoFocus
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
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Inntektsprognose");
  const [manualLines, setManualLines] = useState<ManualIncomeLine[]>([]);
  const [loadingManual, setLoadingManual] = useState(true);
  const [includeLowConfidence, setIncludeLowConfidence] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();

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
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Inntektsprognose 2026"
        subtitle={
          <>
            {formatKr(rollup.totalt)}
            {lastUpdated ? ` · sist oppdatert ${formatDateDMY(lastUpdated)}` : " · ingen data ennå"}
          </>
        }
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-5">
          <p className="-mt-2 text-2xs text-ink-4">
            Øyeblikksbilde — avstemt manuelt mot Visma NXT og Fazile, oppdateres ved forespørsel. Ikke en live-integrasjon.
          </p>

          <ForecastSummaryBlock rollup={rollup} />

          <div className="flex flex-col gap-1.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Avstemmingskontroller</p>
            <ReconciliationPanel />
          </div>

          <InvoicedBlock />
          <RemainingBlock />
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
      )}
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
