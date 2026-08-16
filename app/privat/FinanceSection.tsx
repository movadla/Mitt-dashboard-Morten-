"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, CollapsibleBody, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import { formatDateDMY, formatKr } from "@/lib/widgets";
import type { Loan } from "@/lib/loans";
import type { SavingsAccount } from "@/lib/savings";
import type { SalaryEntry } from "@/lib/salary";
import type { AiUsageSummary } from "@/lib/aiUsage";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import { Wallet } from "lucide-react";

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function AiUsageBox({ usage, onSaveBalance }: { usage: AiUsageSummary; onSaveBalance: (amount: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  function startEdit() {
    setInput(usage.balanceUsd != null ? String(usage.balanceUsd) : "");
    setEditing(true);
  }
  function save() {
    const amount = Number(input.replace(",", "."));
    if (Number.isFinite(amount) && amount >= 0) {
      onSaveBalance(amount);
      setEditing(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold tabular-nums ${usage.overDaily ? "text-status-danger" : "text-ink-1"}`}>
            {formatUsd(usage.last24hUsd)} <span className="text-2xs font-normal text-ink-4">siste 24t</span>
          </p>
          <p className={`mt-0.5 text-sm font-semibold tabular-nums ${usage.overMonthly ? "text-status-danger" : "text-ink-1"}`}>
            {formatUsd(usage.last30daysUsd)} <span className="text-2xs font-normal text-ink-4">siste 30 dager</span>
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="USD"
              className="w-20 rounded-lg border border-line bg-surface-1 px-2 py-1 text-xs text-ink-1 outline-none focus:border-line-strong"
            />
            <button type="button" onClick={save} className="text-2xs font-semibold uppercase text-accent-privat">
              Lagre
            </button>
          </div>
        ) : (
          <button type="button" onClick={startEdit} className="text-right">
            <p className="text-sm font-semibold tabular-nums text-ink-1">
              {usage.balanceUsd != null ? formatUsd(usage.balanceUsd) : "Sett saldo"}
            </p>
            <p className="text-2xs text-ink-4">Saldo igjen</p>
          </button>
        )}
      </div>
      {(usage.overDaily || usage.overMonthly) && (
        <p className="mt-2 text-2xs font-medium text-status-danger">
          {usage.overDaily ? `Over ${formatUsd(usage.dailyAlertUsd)}/dag. ` : ""}
          {usage.overMonthly ? `Over ${formatUsd(usage.monthlyAlertUsd)} siste 30 dager.` : ""}
        </p>
      )}
      <p className="mt-2 text-2xs text-ink-4">
        Saldoen er et anslag basert på appens egen bruk, ikke live fra Anthropic — oppdater etter å ha sjekket
        console.anthropic.com.
      </p>
    </div>
  );
}

type LoanFormValues = {
  name: string;
  lender: string;
  remainingAmount: string;
  originalAmount: string;
  nominalRate: string;
  effectiveRate: string;
  nextPaymentDate: string;
  maturityDate: string;
  rateFixedUntil: string;
  coBorrower: string;
};

const EMPTY_FORM: LoanFormValues = {
  name: "",
  lender: "",
  remainingAmount: "",
  originalAmount: "",
  nominalRate: "",
  effectiveRate: "",
  nextPaymentDate: "",
  maturityDate: "",
  rateFixedUntil: "",
  coBorrower: "",
};

function loanToForm(loan: Loan): LoanFormValues {
  return {
    name: loan.name,
    lender: loan.lender,
    remainingAmount: String(loan.remainingAmount),
    originalAmount: loan.originalAmount !== undefined ? String(loan.originalAmount) : "",
    nominalRate: loan.nominalRate !== undefined ? String(loan.nominalRate) : "",
    effectiveRate: loan.effectiveRate !== undefined ? String(loan.effectiveRate) : "",
    nextPaymentDate: loan.nextPaymentDate ?? "",
    maturityDate: loan.maturityDate ?? "",
    rateFixedUntil: loan.rateFixedUntil ?? "",
    coBorrower: loan.coBorrower ?? "",
  };
}

function formToPayload(form: LoanFormValues) {
  return {
    name: form.name.trim(),
    lender: form.lender.trim(),
    remainingAmount: Number(form.remainingAmount.replace(",", ".")),
    originalAmount: form.originalAmount ? Number(form.originalAmount.replace(",", ".")) : null,
    nominalRate: form.nominalRate ? Number(form.nominalRate.replace(",", ".")) : null,
    effectiveRate: form.effectiveRate ? Number(form.effectiveRate.replace(",", ".")) : null,
    nextPaymentDate: form.nextPaymentDate || null,
    maturityDate: form.maturityDate || null,
    rateFixedUntil: form.rateFixedUntil || null,
    coBorrower: form.coBorrower.trim() || null,
  };
}

function LoanForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: LoanFormValues;
  onCancel: () => void;
  onSave: (form: LoanFormValues) => void;
}) {
  const [form, setForm] = useState(initial);
  const valid = form.name.trim() && form.lender.trim() && form.remainingAmount.trim();

  function set<K extends keyof LoanFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Navn (f.eks. Fastrente 5 år annuitet)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={form.lender}
          onChange={(e) => set("lender", e.target.value)}
          placeholder="Bank"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="text"
          value={form.coBorrower}
          onChange={(e) => set("coBorrower", e.target.value)}
          placeholder="Medlåntaker (valgfritt)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          value={form.remainingAmount}
          onChange={(e) => set("remainingAmount", e.target.value)}
          placeholder="Gjenstående (kr)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="number"
          value={form.originalAmount}
          onChange={(e) => set("originalAmount", e.target.value)}
          placeholder="Opprinnelig (kr)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          step="0.01"
          value={form.nominalRate}
          onChange={(e) => set("nominalRate", e.target.value)}
          placeholder="Nominell rente %"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="number"
          step="0.01"
          value={form.effectiveRate}
          onChange={(e) => set("effectiveRate", e.target.value)}
          placeholder="Effektiv rente %"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-0.5 text-2xs text-ink-4">
          Neste betaling
          <input
            type="date"
            value={form.nextPaymentDate}
            onChange={(e) => set("nextPaymentDate", e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-2xs text-ink-4">
          Fastrente til
          <input
            type="date"
            value={form.rateFixedUntil}
            onChange={(e) => set("rateFixedUntil", e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-2xs text-ink-4">
          Innfrielsesdato
          <input
            type="date"
            value={form.maturityDate}
            onChange={(e) => set("maturityDate", e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

// Gjenværende tid TIL FASTRENTEN UTLØPER (ikke til lånet er nedbetalt —
// bekreftet med Morten). Brukes kun for lån med rateFixedUntil satt.
function remainingFixedTermLabel(rateFixedUntil: string, todayIso: string): string {
  const until = new Date(rateFixedUntil + "T00:00:00Z");
  const today = new Date(todayIso + "T00:00:00Z");
  let months = (until.getUTCFullYear() - today.getUTCFullYear()) * 12 + (until.getUTCMonth() - today.getUTCMonth());
  if (until.getUTCDate() < today.getUTCDate()) months--;
  if (months <= 0) return "Fastrenten er utløpt";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} år`);
  if (rest > 0) parts.push(`${rest} mnd`);
  return `${parts.join(" ")} igjen på fastrenten`;
}

function LoanRow({
  loan,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  loan: Loan;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, form: LoanFormValues) => void;
  onRemove: (id: string) => void;
}) {
  if (editing) {
    return (
      <li>
        <LoanForm initial={loanToForm(loan)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(loan.id, form)} />
      </li>
    );
  }

  return (
    <li>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <button type="button" onClick={() => onStartEdit(loan.id)} aria-label="Rediger lån" className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm text-ink-1">{loan.name}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-1">{formatKr(loan.remainingAmount)}</p>
          </div>
          <p className="mt-0.5 text-2xs text-ink-4">
            {loan.lender}
            {loan.coBorrower ? ` · med ${loan.coBorrower}` : ""}
            {loan.nominalRate !== undefined ? ` · ${loan.nominalRate.toLocaleString("nb-NO")}% rente` : ""}
            {loan.nextPaymentDate ? ` · neste betaling ${formatDateDMY(loan.nextPaymentDate)}` : ""}
          </p>
          {loan.rateFixedUntil ? (
            <p className="mt-1.5 text-2xs text-ink-4">{remainingFixedTermLabel(loan.rateFixedUntil, localDateString())}</p>
          ) : (
            loan.originalAmount && loan.originalAmount > 0 && (() => {
              const paidDown = Math.min(1, Math.max(0, 1 - loan.remainingAmount / loan.originalAmount!));
              return (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent-privat" style={{ width: `${(paidDown * 100).toFixed(1)}%` }} />
                  </div>
                  <span className="shrink-0 text-2xs tabular-nums text-ink-4">{Math.round(paidDown * 100)}% nedbetalt</span>
                </div>
              );
            })()
          )}
        </button>
        <button
          type="button"
          onClick={() => onRemove(loan.id)}
          aria-label="Slett lån"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
    </li>
  );
}

type SavingsFormValues = { name: string; institution: string; balance: string; note: string };
const EMPTY_SAVINGS_FORM: SavingsFormValues = { name: "", institution: "", balance: "", note: "" };

function savingsToForm(a: SavingsAccount): SavingsFormValues {
  return { name: a.name, institution: a.institution, balance: String(a.balance), note: a.note ?? "" };
}

function savingsToPayload(form: SavingsFormValues) {
  return {
    name: form.name.trim(),
    institution: form.institution.trim(),
    balance: Number(form.balance.replace(",", ".")),
    note: form.note.trim() || null,
  };
}

function SavingsForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: SavingsFormValues;
  onCancel: () => void;
  onSave: (form: SavingsFormValues) => void;
}) {
  const [form, setForm] = useState(initial);
  const valid = form.name.trim() && form.institution.trim() && form.balance.trim();

  function set<K extends keyof SavingsFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Navn (f.eks. Fondskonto)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={form.institution}
          onChange={(e) => set("institution", e.target.value)}
          placeholder="Bank/plattform"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="number"
          value={form.balance}
          onChange={(e) => set("balance", e.target.value)}
          placeholder="Saldo (kr)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <input
        type="text"
        value={form.note}
        onChange={(e) => set("note", e.target.value)}
        placeholder="Notat (valgfritt)"
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
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function SavingsRow({
  account,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  account: SavingsAccount;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, form: SavingsFormValues) => void;
  onRemove: (id: string) => void;
}) {
  if (editing) {
    return (
      <li>
        <SavingsForm initial={savingsToForm(account)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(account.id, form)} />
      </li>
    );
  }

  return (
    <li>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <button type="button" onClick={() => onStartEdit(account.id)} aria-label="Rediger sparekonto" className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm text-ink-1">{account.name}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-1">{formatKr(account.balance)}</p>
          </div>
          <p className="mt-0.5 text-2xs text-ink-4">
            {account.institution}
            {account.note ? ` · ${account.note}` : ""}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onRemove(account.id)}
          aria-label="Slett sparekonto"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
    </li>
  );
}

type SalaryFormValues = { person: string; employer: string; grossMonthly: string; netMonthly: string; note: string };
const EMPTY_SALARY_FORM: SalaryFormValues = { person: "", employer: "", grossMonthly: "", netMonthly: "", note: "" };

function salaryToForm(s: SalaryEntry): SalaryFormValues {
  return {
    person: s.person,
    employer: s.employer,
    grossMonthly: String(s.grossMonthly),
    netMonthly: s.netMonthly !== undefined ? String(s.netMonthly) : "",
    note: s.note ?? "",
  };
}

function salaryToPayload(form: SalaryFormValues) {
  return {
    person: form.person.trim(),
    employer: form.employer.trim(),
    grossMonthly: Number(form.grossMonthly.replace(",", ".")),
    netMonthly: form.netMonthly ? Number(form.netMonthly.replace(",", ".")) : null,
    note: form.note.trim() || null,
  };
}

function SalaryForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: SalaryFormValues;
  onCancel: () => void;
  onSave: (form: SalaryFormValues) => void;
}) {
  const [form, setForm] = useState(initial);
  const valid = form.person.trim() && form.employer.trim() && form.grossMonthly.trim();

  function set<K extends keyof SalaryFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={form.person}
          onChange={(e) => set("person", e.target.value)}
          placeholder="Person"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="text"
          value={form.employer}
          onChange={(e) => set("employer", e.target.value)}
          placeholder="Arbeidsgiver"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          value={form.grossMonthly}
          onChange={(e) => set("grossMonthly", e.target.value)}
          placeholder="Bruttolønn/mnd (kr)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="number"
          value={form.netMonthly}
          onChange={(e) => set("netMonthly", e.target.value)}
          placeholder="Nettolønn/mnd (valgfritt)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <input
        type="text"
        value={form.note}
        onChange={(e) => set("note", e.target.value)}
        placeholder="Notat (valgfritt)"
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
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function SalaryRow({
  entry,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  entry: SalaryEntry;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, form: SalaryFormValues) => void;
  onRemove: (id: string) => void;
}) {
  if (editing) {
    return (
      <li>
        <SalaryForm initial={salaryToForm(entry)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(entry.id, form)} />
      </li>
    );
  }

  return (
    <li>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <button type="button" onClick={() => onStartEdit(entry.id)} aria-label="Rediger lønn" className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm text-ink-1">{entry.person}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-1">{formatKr(entry.grossMonthly)}/mnd</p>
          </div>
          <p className="mt-0.5 text-2xs text-ink-4">
            {entry.employer}
            {entry.netMonthly !== undefined ? ` · ${formatKr(entry.netMonthly)} netto` : ""}
            {entry.note ? ` · ${entry.note}` : ""}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          aria-label="Slett lønnsoppføring"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
    </li>
  );
}

export default function FinanceSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Økonomi", true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [savings, setSavings] = useState<SavingsAccount[]>([]);
  const [salary, setSalary] = useState<SalaryEntry[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [editingSavingsId, setEditingSavingsId] = useState<string | null>(null);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<{ type: "loan" | "savings" | "salary"; id: string }>();

  const load = useCallback(() => {
    Promise.allSettled([
      fetch("/api/loans").then((r) => r.json()),
      fetch("/api/savings").then((r) => r.json()),
      fetch("/api/salary").then((r) => r.json()),
      fetch("/api/ai-usage").then((r) => r.json()),
    ]).then(([l, s, p, a]) => {
      setLoans(l.status === "fulfilled" ? ((l.value.loans ?? []) as Loan[]) : []);
      setSavings(s.status === "fulfilled" ? ((s.value.savings ?? []) as SavingsAccount[]) : []);
      setSalary(p.status === "fulfilled" ? ((p.value.salary ?? []) as SalaryEntry[]) : []);
      setAiUsage(a.status === "fulfilled" && !a.value.error ? (a.value as AiUsageSummary) : null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function handleAddLoan(form: LoanFormValues) {
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToPayload(form)),
    });
    if (res.ok) {
      const created: Loan = await res.json();
      setLoans((prev) => [...prev, created].sort((a, b) => b.remainingAmount - a.remainingAmount));
      setShowLoanForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleSaveLoanEdit(id: string, form: LoanFormValues) {
    const res = await fetch(`/api/loans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToPayload(form)),
    });
    if (res.ok) {
      const updated: Loan = await res.json();
      setLoans((prev) => prev.map((l) => (l.id === id ? updated : l)).sort((a, b) => b.remainingAmount - a.remainingAmount));
      setEditingLoanId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleRemoveLoan(id: string) {
    setLoans((prev) => prev.filter((l) => l.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/loans/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleAddSavings(form: SavingsFormValues) {
    const res = await fetch("/api/savings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(savingsToPayload(form)),
    });
    if (res.ok) {
      const created: SavingsAccount = await res.json();
      setSavings((prev) => [...prev, created].sort((a, b) => b.balance - a.balance));
      setShowSavingsForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleSaveSavingsEdit(id: string, form: SavingsFormValues) {
    const res = await fetch(`/api/savings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(savingsToPayload(form)),
    });
    if (res.ok) {
      const updated: SavingsAccount = await res.json();
      setSavings((prev) => prev.map((s) => (s.id === id ? updated : s)).sort((a, b) => b.balance - a.balance));
      setEditingSavingsId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleRemoveSavings(id: string) {
    setSavings((prev) => prev.filter((s) => s.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/savings/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleAddSalary(form: SalaryFormValues) {
    const res = await fetch("/api/salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(salaryToPayload(form)),
    });
    if (res.ok) {
      const created: SalaryEntry = await res.json();
      setSalary((prev) => [...prev, created].sort((a, b) => a.person.localeCompare(b.person)));
      setShowSalaryForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleSaveSalaryEdit(id: string, form: SalaryFormValues) {
    const res = await fetch(`/api/salary/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(salaryToPayload(form)),
    });
    if (res.ok) {
      const updated: SalaryEntry = await res.json();
      setSalary((prev) => prev.map((s) => (s.id === id ? updated : s)).sort((a, b) => a.person.localeCompare(b.person)));
      setEditingSalaryId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleRemoveSalary(id: string) {
    setSalary((prev) => prev.filter((s) => s.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/salary/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleSaveBalance(amount: number) {
    const res = await fetch("/api/ai-usage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balanceUsd: amount }),
    });
    if (res.ok) {
      setAiUsage((await res.json()) as AiUsageSummary);
    }
  }

  const totalRemaining = loans.reduce((sum, l) => sum + l.remainingAmount, 0);

  return (
    <div className={`${CARD_SHELL} !border-t-2 !border-t-source-outlook/60 p-4`}>
      <CardHeader
        title="Økonomi"
        subtitle={loans.length > 0 ? formatKr(totalRemaining) : "Ukentlig"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Wallet}
        iconColorClass="text-source-outlook"
      />
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-4">
          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Lån</p>
                {showLoanForm ? (
                  <LoanForm initial={EMPTY_FORM} onCancel={() => setShowLoanForm(false)} onSave={handleAddLoan} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLoanForm(true)}
                    className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                  >
                    <span className="text-base leading-none">+</span> Nytt lån
                  </button>
                )}
                {loans.length === 0 ? (
                  <p className="text-sm text-ink-3">Ingen lån lagt inn ennå.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {loans.map((l) => (
                      <LoanRow
                        key={l.id}
                        loan={l}
                        editing={editingLoanId === l.id}
                        onStartEdit={setEditingLoanId}
                        onCancelEdit={() => setEditingLoanId(null)}
                        onSaveEdit={handleSaveLoanEdit}
                        onRemove={(id) => confirmDelete.request({ type: "loan", id })}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Sparing</p>
                {showSavingsForm ? (
                  <SavingsForm initial={EMPTY_SAVINGS_FORM} onCancel={() => setShowSavingsForm(false)} onSave={handleAddSavings} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSavingsForm(true)}
                    className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                  >
                    <span className="text-base leading-none">+</span> Ny sparekonto
                  </button>
                )}
                {savings.length === 0 ? (
                  <p className="text-sm text-ink-3">Ingen sparing lagt inn ennå.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {savings.map((s) => (
                      <SavingsRow
                        key={s.id}
                        account={s}
                        editing={editingSavingsId === s.id}
                        onStartEdit={setEditingSavingsId}
                        onCancelEdit={() => setEditingSavingsId(null)}
                        onSaveEdit={handleSaveSavingsEdit}
                        onRemove={(id) => confirmDelete.request({ type: "savings", id })}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Lønn</p>
                {showSalaryForm ? (
                  <SalaryForm initial={EMPTY_SALARY_FORM} onCancel={() => setShowSalaryForm(false)} onSave={handleAddSalary} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSalaryForm(true)}
                    className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                  >
                    <span className="text-base leading-none">+</span> Ny lønnsoppføring
                  </button>
                )}
                {salary.length === 0 ? (
                  <p className="text-sm text-ink-3">Ingen lønn lagt inn ennå.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {salary.map((s) => (
                      <SalaryRow
                        key={s.id}
                        entry={s}
                        editing={editingSalaryId === s.id}
                        onStartEdit={setEditingSalaryId}
                        onCancelEdit={() => setEditingSalaryId(null)}
                        onSaveEdit={handleSaveSalaryEdit}
                        onRemove={(id) => confirmDelete.request({ type: "salary", id })}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">AI-bruk (chatbot)</p>
                {aiUsage ? (
                  <AiUsageBox usage={aiUsage} onSaveBalance={handleSaveBalance} />
                ) : (
                  <p className="text-sm text-ink-3">Fikk ikke hentet AI-bruk akkurat nå.</p>
                )}
              </div>
            </>
          )}
        </div>
      </CollapsibleBody>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={(() => {
          const pending = confirmDelete.pending;
          if (!pending) return "";
          if (pending.type === "loan") return `Slette lånet «${loans.find((l) => l.id === pending.id)?.name ?? ""}»?`;
          if (pending.type === "savings")
            return `Slette sparekontoen «${savings.find((s) => s.id === pending.id)?.name ?? ""}»?`;
          return `Slette lønnsoppføringen for «${salary.find((s) => s.id === pending.id)?.person ?? ""}»?`;
        })()}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          if (pending.type === "loan") handleRemoveLoan(pending.id);
          else if (pending.type === "savings") handleRemoveSavings(pending.id);
          else handleRemoveSalary(pending.id);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
