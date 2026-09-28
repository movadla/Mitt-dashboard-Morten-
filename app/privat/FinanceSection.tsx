"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import {
  CardHeader,
  ConfirmDialog,
  MutationError,
  SkeletonRows,
  useConfirmDelete,
  useMutationError,
} from "../CardShell";
import { formatDateDMY, formatKr, formatUsd } from "@/lib/widgets";
import type { Loan } from "@/lib/loans";
import type { SavingsAccount } from "@/lib/savings";
import type { SalaryEntry } from "@/lib/salary";
import type { AccountingEntry, AccountingEntryType } from "@/lib/accounting";
import type { AiUsageSummary } from "@/lib/aiUsage";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import SwipeableRow from "./SwipeableRow";
import { RatioBar } from "./DataStrips";
import { Wallet, X } from "lucide-react";

const EMPTY_LOANS: Loan[] = [];
const EMPTY_SAVINGS: SavingsAccount[] = [];
const EMPTY_SALARY: SalaryEntry[] = [];
const EMPTY_ACCOUNTING: AccountingEntry[] = [];

function AiUsageBox({
  usage,
  onSaveBalance,
}: {
  usage: AiUsageSummary;
  onSaveBalance: (amount: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function startEdit() {
    setInput(usage.balanceUsd != null ? String(usage.balanceUsd) : "");
    setEditing(true);
  }
  async function save() {
    const amount = Number(input.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSaveBalance(amount);
      if (ok) setEditing(false);
    } finally {
      setSubmitting(false);
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
              className="w-20 rounded-lg border border-transparent bg-surface-1 px-2 py-1 text-xs text-ink-1 outline-none focus:border-line-strong"
            />
            <button type="button" onClick={save} disabled={submitting} className="text-2xs font-semibold uppercase text-accent-privat disabled:opacity-40">
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

// ── Delt skjema-/rad-mønster (2026-09-28) ───────────────────────────────────
// Lån/Sparing/Lønn/Regnskap hadde hver sitt eget ~90-linjers skjema og sin
// egen swipe-og-rediger-rad, identiske i struktur og bare ulike i hvilke felt
// som vises. EntryForm/EntryRow er de delte skjelettene; hver entitet gir kun
// sin feltkonfigurasjon (EntryForm) eller sin tekst/farge (EntryRow) - all
// felt-til-payload-konvertering (loanToForm/formToPayload osv.) er UENDRET og
// ligger fortsatt separat per entitet, siden feltene faktisk betyr noe ulikt
// (prosent vs. kroner vs. dato) og ikke bør gjettes generisk.
interface EntryField {
  key: string;
  type: "text" | "number" | "date";
  placeholder?: string;
  // Når satt: feltet får en synlig liten etikett over seg (Lån sine tre
  // datofelt) i stedet for placeholder-stilen de andre feltene bruker.
  label?: string;
  step?: string;
  // Full bredde på egen rad (navn/beskrivelse/notat) i stedet for gruppert
  // side ved side med naboene i samme rad.
  full?: boolean;
}

interface EntryFormConfig {
  rows: EntryField[][];
  requiredKeys: string[];
}

function EntryForm<F extends Record<string, string>>({
  config,
  initial,
  onCancel,
  onSave,
}: {
  config: EntryFormConfig;
  initial: F;
  onCancel: () => void;
  onSave: (form: F) => Promise<boolean>;
}) {
  const [form, setForm] = useState<F>(initial);
  const [submitting, setSubmitting] = useState(false);
  const valid = config.requiredKeys.every((k) => form[k]?.trim());

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }) as F);
  }

  async function save() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSave(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      {config.rows.map((row, i) => {
        const singleFull = row.length === 1 && row[0].full;
        return (
          <div key={i} className={singleFull ? undefined : "flex flex-wrap items-center gap-2"}>
            {row.map((field) =>
              field.label ? (
                <label key={field.key} className="flex flex-col gap-0.5 text-2xs text-ink-4">
                  {field.label}
                  <input
                    type={field.type}
                    value={form[field.key] ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                  />
                </label>
              ) : (
                <input
                  key={field.key}
                  type={field.type}
                  step={field.step}
                  value={form[field.key] ?? ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={
                    field.full
                      ? "rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                      : "min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
                  }
                />
              ),
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid || submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

// Delt rad-skjelett: swipe-for-å-slette, trykk-for-å-redigere, beløp til
// høyre for navnet. `amountColorClass` er bevisst valgfri og default nøytral
// - kun Regnskap sitt inntekt/utgift-fortegn får farge (se AccountingRow),
// Lån/Sparing/Lønn har ingen "denne raden er god/dårlig"-egenskap i seg selv
// og skal derfor IKKE farges (samme "ett signal, ikke overalt"-prinsipp som
// Kundefordringer ble ryddet etter denne økten - se toppnivå-stripen i
// FinanceSection under for hvor "penger inn vs. penger ut" faktisk vises).
function EntryRow({
  editing,
  editForm,
  primary,
  amount,
  amountColorClass = "text-ink-1",
  secondary,
  extra,
  editLabel,
  deleteLabel,
  onStartEdit,
  onRemove,
}: {
  editing: boolean;
  editForm: React.ReactNode;
  primary: string;
  amount: string;
  amountColorClass?: string;
  secondary: string;
  extra?: React.ReactNode;
  editLabel: string;
  deleteLabel: string;
  onStartEdit: () => void;
  onRemove: () => void;
}) {
  if (editing) return <li>{editForm}</li>;
  return (
    <li>
      <SwipeableRow onSwipeLeft={onRemove} leftLabel="Slett">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
          <button type="button" onClick={onStartEdit} aria-label={editLabel} className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium text-ink-1">{primary}</p>
              <p className={`shrink-0 text-sm font-semibold tabular-nums ${amountColorClass}`}>{amount}</p>
            </div>
            <p className="mt-0.5 text-2xs text-ink-4">{secondary}</p>
            {extra}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={deleteLabel}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </SwipeableRow>
    </li>
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

const LOAN_FIELDS: EntryFormConfig = {
  rows: [
    [{ key: "name", type: "text", placeholder: "Navn (f.eks. Fastrente 5 år annuitet)", full: true }],
    [
      { key: "lender", type: "text", placeholder: "Bank" },
      { key: "coBorrower", type: "text", placeholder: "Medlåntaker (valgfritt)" },
    ],
    [
      { key: "remainingAmount", type: "number", placeholder: "Gjenstående (kr)" },
      { key: "originalAmount", type: "number", placeholder: "Opprinnelig (kr)" },
    ],
    [
      { key: "nominalRate", type: "number", step: "0.01", placeholder: "Nominell rente %" },
      { key: "effectiveRate", type: "number", step: "0.01", placeholder: "Effektiv rente %" },
    ],
    [
      { key: "nextPaymentDate", type: "date", label: "Neste betaling" },
      { key: "rateFixedUntil", type: "date", label: "Fastrente til" },
      { key: "maturityDate", type: "date", label: "Innfrielsesdato" },
    ],
  ],
  requiredKeys: ["name", "lender", "remainingAmount"],
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
  onSaveEdit: (id: string, form: LoanFormValues) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  let extra: React.ReactNode = null;
  if (loan.rateFixedUntil) {
    const label = remainingFixedTermLabel(loan.rateFixedUntil, localDateString());
    // v2 (2026-09-28, Morten: fastrente-varsel skal skille seg ut): kun den
    // UTLØPTE meldingen er handlingskrevende - "X år Y mnd igjen" er bare
    // informasjon og skal ikke se ut som et problem.
    const expired = label === "Fastrenten er utløpt";
    extra = <p className={`mt-1.5 text-2xs ${expired ? "font-medium text-status-warning" : "text-ink-4"}`}>{label}</p>;
  } else if (loan.originalAmount && loan.originalAmount > 0) {
    const paidDown = Math.min(1, Math.max(0, 1 - loan.remainingAmount / loan.originalAmount));
    const pct = Math.round(paidDown * 100);
    extra = (
      <div className="mt-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <RatioBar done={pct} total={100} colorClass="text-accent-privat" label={`${pct}% nedbetalt`} />
        </div>
        <span className="shrink-0 text-2xs tabular-nums text-ink-4">{pct}% nedbetalt</span>
      </div>
    );
  }

  return (
    <EntryRow
      editing={editing}
      editForm={<EntryForm config={LOAN_FIELDS} initial={loanToForm(loan)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(loan.id, form)} />}
      primary={loan.name}
      amount={formatKr(loan.remainingAmount)}
      secondary={`${loan.lender}${loan.coBorrower ? ` · med ${loan.coBorrower}` : ""}${
        loan.nominalRate !== undefined ? ` · ${loan.nominalRate.toLocaleString("nb-NO")}% rente` : ""
      }${loan.nextPaymentDate ? ` · neste betaling ${formatDateDMY(loan.nextPaymentDate)}` : ""}`}
      extra={extra}
      editLabel="Rediger lån"
      deleteLabel="Slett lån"
      onStartEdit={() => onStartEdit(loan.id)}
      onRemove={() => onRemove(loan.id)}
    />
  );
}

type SavingsFormValues = { name: string; institution: string; balance: string; note: string };
const EMPTY_SAVINGS_FORM: SavingsFormValues = { name: "", institution: "", balance: "", note: "" };

const SAVINGS_FIELDS: EntryFormConfig = {
  rows: [
    [{ key: "name", type: "text", placeholder: "Navn (f.eks. Fondskonto)", full: true }],
    [
      { key: "institution", type: "text", placeholder: "Bank/plattform" },
      { key: "balance", type: "number", placeholder: "Saldo (kr)" },
    ],
    [{ key: "note", type: "text", placeholder: "Notat (valgfritt)", full: true }],
  ],
  requiredKeys: ["name", "institution", "balance"],
};

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
  onSaveEdit: (id: string, form: SavingsFormValues) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  return (
    <EntryRow
      editing={editing}
      editForm={
        <EntryForm config={SAVINGS_FIELDS} initial={savingsToForm(account)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(account.id, form)} />
      }
      primary={account.name}
      amount={formatKr(account.balance)}
      secondary={`${account.institution}${account.note ? ` · ${account.note}` : ""}`}
      editLabel="Rediger sparekonto"
      deleteLabel="Slett sparekonto"
      onStartEdit={() => onStartEdit(account.id)}
      onRemove={() => onRemove(account.id)}
    />
  );
}

type SalaryFormValues = { person: string; employer: string; grossMonthly: string; netMonthly: string; note: string };
const EMPTY_SALARY_FORM: SalaryFormValues = { person: "", employer: "", grossMonthly: "", netMonthly: "", note: "" };

const SALARY_FIELDS: EntryFormConfig = {
  rows: [
    [
      { key: "person", type: "text", placeholder: "Person" },
      { key: "employer", type: "text", placeholder: "Arbeidsgiver" },
    ],
    [
      { key: "grossMonthly", type: "number", placeholder: "Bruttolønn/mnd (kr)" },
      { key: "netMonthly", type: "number", placeholder: "Nettolønn/mnd (valgfritt)" },
    ],
    [{ key: "note", type: "text", placeholder: "Notat (valgfritt)", full: true }],
  ],
  requiredKeys: ["person", "employer", "grossMonthly"],
};

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
  onSaveEdit: (id: string, form: SalaryFormValues) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  return (
    <EntryRow
      editing={editing}
      editForm={<EntryForm config={SALARY_FIELDS} initial={salaryToForm(entry)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(entry.id, form)} />}
      primary={entry.person}
      amount={`${formatKr(entry.grossMonthly)}/mnd`}
      secondary={`${entry.employer}${entry.netMonthly !== undefined ? ` · ${formatKr(entry.netMonthly)} netto` : ""}${
        entry.note ? ` · ${entry.note}` : ""
      }`}
      editLabel="Rediger lønn"
      deleteLabel="Slett lønnsoppføring"
      onStartEdit={() => onStartEdit(entry.id)}
      onRemove={() => onRemove(entry.id)}
    />
  );
}

type AccountingFormValues = { description: string; amount: string; date: string; note: string };

function emptyAccountingForm(): AccountingFormValues {
  return { description: "", amount: "", date: localDateString(), note: "" };
}

const ACCOUNTING_FIELDS: EntryFormConfig = {
  rows: [
    [{ key: "description", type: "text", placeholder: "Beskrivelse", full: true }],
    [
      { key: "amount", type: "number", placeholder: "Beløp (kr)" },
      { key: "date", type: "date" },
    ],
    [{ key: "note", type: "text", placeholder: "Notat (valgfritt)", full: true }],
  ],
  requiredKeys: ["description", "amount", "date"],
};

function accountingToForm(entry: AccountingEntry): AccountingFormValues {
  return { description: entry.description, amount: String(entry.amount), date: entry.date, note: entry.note ?? "" };
}

function accountingToPayload(type: AccountingEntryType, form: AccountingFormValues) {
  return {
    type,
    description: form.description.trim(),
    amount: Number(form.amount.replace(",", ".")),
    date: form.date,
    note: form.note.trim() || null,
  };
}

// Delt av både Inntekter- og Utgifter-listen (samme felter, kun `type`
// skiller dem) — samme skjema-/rad-mønster som Sparing/Lønn over.
function AccountingRow({
  entry,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  entry: AccountingEntry;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, form: AccountingFormValues) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  return (
    <EntryRow
      editing={editing}
      editForm={
        <EntryForm config={ACCOUNTING_FIELDS} initial={accountingToForm(entry)} onCancel={onCancelEdit} onSave={(form) => onSaveEdit(entry.id, form)} />
      }
      primary={entry.description}
      amount={`${entry.type === "inntekt" ? "+" : "−"}${formatKr(entry.amount)}`}
      // Eneste stedet en rad-farge faktisk sier noe (inn/ut) - se begrunnelsen
      // i EntryRow sin kommentar.
      amountColorClass={entry.type === "inntekt" ? "text-status-positive" : "text-ink-1"}
      secondary={`${formatDateDMY(entry.date)}${entry.note ? ` · ${entry.note}` : ""}`}
      editLabel="Rediger post"
      deleteLabel="Slett post"
      onStartEdit={() => onStartEdit(entry.id)}
      onRemove={() => onRemove(entry.id)}
    />
  );
}

const ADD_MENU_BTN =
  "rounded-full border border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink-1";

export default function FinanceSection() {
  const { data: loansData, isLoading: loansLoading, mutate: mutateLoans } = useSWR<{ loans: Loan[] }>("/api/loans", jsonFetcher);
  const { data: savingsData, isLoading: savingsLoading, mutate: mutateSavings } = useSWR<{ savings: SavingsAccount[] }>("/api/savings", jsonFetcher);
  const { data: salaryData, isLoading: salaryLoading, mutate: mutateSalary } = useSWR<{ salary: SalaryEntry[] }>("/api/salary", jsonFetcher);
  const { data: aiUsageRaw, mutate: mutateAiUsage } = useSWR<AiUsageSummary | { error: string }>("/api/ai-usage", jsonFetcher);
  const { data: accountingData, isLoading: accountingLoading, mutate: mutateAccounting } = useSWR<{ entries: AccountingEntry[] }>(
    "/api/accounting",
    jsonFetcher,
  );
  const loans = loansData?.loans ?? EMPTY_LOANS;
  const savings = savingsData?.savings ?? EMPTY_SAVINGS;
  const salary = salaryData?.salary ?? EMPTY_SALARY;
  const accounting = accountingData?.entries ?? EMPTY_ACCOUNTING;
  const income = accounting.filter((e) => e.type === "inntekt");
  const expenses = accounting.filter((e) => e.type === "utgift");
  const aiUsage = aiUsageRaw && !("error" in aiUsageRaw) ? aiUsageRaw : null;
  const loading = loansLoading || savingsLoading || salaryLoading || accountingLoading;
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [editingSavingsId, setEditingSavingsId] = useState<string | null>(null);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [visibleLoanCount, setVisibleLoanCount] = useState(10);
  const [visibleSavingsCount, setVisibleSavingsCount] = useState(10);
  const [visibleSalaryCount, setVisibleSalaryCount] = useState(10);
  const [visibleIncomeCount, setVisibleIncomeCount] = useState(10);
  const [visibleExpenseCount, setVisibleExpenseCount] = useState(10);
  const confirmDelete = useConfirmDelete<{ type: "loan" | "savings" | "salary" | "accounting"; id: string }>();
  const mutationError = useMutationError();

  async function handleAddLoan(form: LoanFormValues): Promise<boolean> {
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til lånet. Prøv igjen.");
        return false;
      }
      const created: Loan = await res.json();
      mutateLoans(
        (current) => current && { loans: [...current.loans, created].sort((a, b) => b.remainingAmount - a.remainingAmount) },
        { revalidate: false },
      );
      setShowLoanForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til lånet. Prøv igjen.");
      return false;
    }
  }

  async function handleSaveLoanEdit(id: string, form: LoanFormValues): Promise<boolean> {
    try {
      const res = await fetch(`/api/loans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
        return false;
      }
      const updated: Loan = await res.json();
      mutateLoans(
        (current) =>
          current && { loans: current.loans.map((l) => (l.id === id ? updated : l)).sort((a, b) => b.remainingAmount - a.remainingAmount) },
        { revalidate: false },
      );
      setEditingLoanId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
      return false;
    }
  }

  async function handleRemoveLoan(id: string) {
    let previous: Loan[] = [];
    mutateLoans(
      (current) => {
        previous = current?.loans ?? [];
        return current && { loans: current.loans.filter((l) => l.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/loans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateLoans({ loans: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette lånet. Prøv igjen.");
    }
  }

  async function handleAddSavings(form: SavingsFormValues): Promise<boolean> {
    try {
      const res = await fetch("/api/savings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savingsToPayload(form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til sparekontoen. Prøv igjen.");
        return false;
      }
      const created: SavingsAccount = await res.json();
      mutateSavings(
        (current) => current && { savings: [...current.savings, created].sort((a, b) => b.balance - a.balance) },
        { revalidate: false },
      );
      setShowSavingsForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til sparekontoen. Prøv igjen.");
      return false;
    }
  }

  async function handleSaveSavingsEdit(id: string, form: SavingsFormValues): Promise<boolean> {
    try {
      const res = await fetch(`/api/savings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savingsToPayload(form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
        return false;
      }
      const updated: SavingsAccount = await res.json();
      mutateSavings(
        (current) => current && { savings: current.savings.map((s) => (s.id === id ? updated : s)).sort((a, b) => b.balance - a.balance) },
        { revalidate: false },
      );
      setEditingSavingsId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
      return false;
    }
  }

  async function handleRemoveSavings(id: string) {
    let previous: SavingsAccount[] = [];
    mutateSavings(
      (current) => {
        previous = current?.savings ?? [];
        return current && { savings: current.savings.filter((s) => s.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/savings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateSavings({ savings: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette sparekontoen. Prøv igjen.");
    }
  }

  async function handleAddSalary(form: SalaryFormValues): Promise<boolean> {
    try {
      const res = await fetch("/api/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salaryToPayload(form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til lønnsoppføringen. Prøv igjen.");
        return false;
      }
      const created: SalaryEntry = await res.json();
      mutateSalary(
        (current) => current && { salary: [...current.salary, created].sort((a, b) => a.person.localeCompare(b.person)) },
        { revalidate: false },
      );
      setShowSalaryForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til lønnsoppføringen. Prøv igjen.");
      return false;
    }
  }

  async function handleSaveSalaryEdit(id: string, form: SalaryFormValues): Promise<boolean> {
    try {
      const res = await fetch(`/api/salary/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salaryToPayload(form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
        return false;
      }
      const updated: SalaryEntry = await res.json();
      mutateSalary(
        (current) => current && { salary: current.salary.map((s) => (s.id === id ? updated : s)).sort((a, b) => a.person.localeCompare(b.person)) },
        { revalidate: false },
      );
      setEditingSalaryId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
      return false;
    }
  }

  async function handleRemoveSalary(id: string) {
    let previous: SalaryEntry[] = [];
    mutateSalary(
      (current) => {
        previous = current?.salary ?? [];
        return current && { salary: current.salary.filter((s) => s.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/salary/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateSalary({ salary: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette lønnsoppføringen. Prøv igjen.");
    }
  }

  // Delt av Inntekter og Utgifter — samme CRUD, kun `type` skiller dem.
  async function handleAddAccounting(type: AccountingEntryType, form: AccountingFormValues): Promise<boolean> {
    try {
      const res = await fetch("/api/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountingToPayload(type, form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til posten. Prøv igjen.");
        return false;
      }
      const created: AccountingEntry = await res.json();
      mutateAccounting((current) => current && { entries: [created, ...current.entries] }, { revalidate: false });
      if (type === "inntekt") setShowIncomeForm(false);
      else setShowExpenseForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til posten. Prøv igjen.");
      return false;
    }
  }

  async function handleSaveAccountingEdit(type: AccountingEntryType, id: string, form: AccountingFormValues): Promise<boolean> {
    try {
      const res = await fetch(`/api/accounting/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountingToPayload(type, form)),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
        return false;
      }
      const updated: AccountingEntry = await res.json();
      mutateAccounting(
        (current) => current && { entries: current.entries.map((e) => (e.id === id ? updated : e)) },
        { revalidate: false },
      );
      if (type === "inntekt") setEditingIncomeId(null);
      else setEditingExpenseId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
      return false;
    }
  }

  async function handleRemoveAccounting(id: string) {
    let previous: AccountingEntry[] = [];
    mutateAccounting(
      (current) => {
        previous = current?.entries ?? [];
        return current && { entries: current.entries.filter((e) => e.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/accounting/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateAccounting({ entries: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette posten. Prøv igjen.");
    }
  }

  async function handleSaveBalance(amount: number): Promise<boolean> {
    try {
      const res = await fetch("/api/ai-usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceUsd: amount }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated = (await res.json()) as AiUsageSummary;
      mutateAiUsage(updated, { revalidate: false });
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre saldo. Prøv igjen.");
      return false;
    }
  }

  const totalRemaining = loans.reduce((sum, l) => sum + l.remainingAmount, 0);
  const totalSavings = savings.reduce((sum, s) => sum + s.balance, 0);
  const netAccounting = income.reduce((sum, e) => sum + e.amount, 0) - expenses.reduce((sum, e) => sum + e.amount, 0);
  const visibleLoans = loans.slice(0, visibleLoanCount);
  const visibleSavings = savings.slice(0, visibleSavingsCount);
  const visibleSalary = salary.slice(0, visibleSalaryCount);
  const visibleIncome = income.slice(0, visibleIncomeCount);
  const visibleExpenses = expenses.slice(0, visibleExpenseCount);

  // v2 (2026-09-28, Morten: "gjør 'Legg til'-knappen til en meny"): åpnet
  // tidligere alltid Lån-skjemaet uansett hva man faktisk ville legge til -
  // nå en liten velger med alle fem, se ADD_MENU_BTN-raden under CardHeader.
  function handleAddClick() {
    setShowAddMenu((v) => !v);
  }

  function openAddForm(action: () => void) {
    action();
    setShowAddMenu(false);
  }

  return (
    <div className="border-t-2 border-t-source-outlook/60 p-4">
      <CardHeader title="Økonomi" onAdd={handleAddClick} addLabel="Legg til" icon={Wallet} iconColorClass="text-source-outlook" />
      {/* v2 (2026-09-28): tre toppnivå-summer i stedet for kun "gjenstår i lån" som
          CardHeader-stat - Sparing og netto inntekt/utgift var usynlige uten å regne selv.
          Kun Netto får farge (rødt/grønt) - Sparing/Gjeld er nøytrale ink-tall, samme
          "ett fargesignal, ikke overalt"-prinsipp som Kundefordringer ble ryddet etter. */}
      <div className="mb-3 grid grid-cols-3 gap-1 sm:gap-2">
        {(
          [
            ["Sparing", totalSavings, "text-ink-1"],
            ["Gjeld", totalRemaining, "text-ink-1"],
            ["Netto", netAccounting, netAccounting >= 0 ? "text-status-positive" : "text-status-danger"],
          ] as const
        ).map(([label, belop, color]) => (
          <div key={label} className="min-w-0 rounded-xl border border-line bg-surface-2 px-1 py-2 sm:px-3 sm:py-2.5">
            <p className="truncate text-2xs font-semibold uppercase tracking-wide text-ink-4">{label}</p>
            <p className={`mt-1 truncate text-xs font-semibold tabular-nums sm:text-lg ${color}`}>{formatKr(belop)}</p>
          </div>
        ))}
      </div>
      {showAddMenu && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => openAddForm(() => setShowLoanForm(true))} className={ADD_MENU_BTN}>
            Lån
          </button>
          <button type="button" onClick={() => openAddForm(() => setShowSavingsForm(true))} className={ADD_MENU_BTN}>
            Sparing
          </button>
          <button type="button" onClick={() => openAddForm(() => setShowSalaryForm(true))} className={ADD_MENU_BTN}>
            Lønn
          </button>
          <button type="button" onClick={() => openAddForm(() => setShowIncomeForm(true))} className={ADD_MENU_BTN}>
            Inntekt
          </button>
          <button type="button" onClick={() => openAddForm(() => setShowExpenseForm(true))} className={ADD_MENU_BTN}>
            Utgift
          </button>
        </div>
      )}
        <div className="flex flex-col gap-4">
          <MutationError message={mutationError.message} />
          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Eiendeler</p>
                  <div className="h-px flex-1 bg-line" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Sparing</p>
                  {showSavingsForm ? (
                    <EntryForm config={SAVINGS_FIELDS} initial={EMPTY_SAVINGS_FORM} onCancel={() => setShowSavingsForm(false)} onSave={handleAddSavings} />
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
                    <>
                      <ul className="flex flex-col gap-1.5">
                        {visibleSavings.map((s) => (
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
                      {savings.length > visibleSavingsCount && (
                        <button
                          type="button"
                          onClick={() => setVisibleSavingsCount((v) => v + 10)}
                          className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                        >
                          {`Mer (${savings.length - visibleSavingsCount})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Gjeld</p>
                  <div className="h-px flex-1 bg-line" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Lån</p>
                  {showLoanForm ? (
                    <EntryForm config={LOAN_FIELDS} initial={EMPTY_FORM} onCancel={() => setShowLoanForm(false)} onSave={handleAddLoan} />
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
                    <>
                      <ul className="flex flex-col gap-1.5">
                        {visibleLoans.map((l) => (
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
                      {loans.length > visibleLoanCount && (
                        <button
                          type="button"
                          onClick={() => setVisibleLoanCount((v) => v + 10)}
                          className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                        >
                          {`Mer (${loans.length - visibleLoanCount})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Regnskap</p>
                  <div className="h-px flex-1 bg-line" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Lønn</p>
                  {showSalaryForm ? (
                    <EntryForm config={SALARY_FIELDS} initial={EMPTY_SALARY_FORM} onCancel={() => setShowSalaryForm(false)} onSave={handleAddSalary} />
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
                    <>
                      <ul className="flex flex-col gap-1.5">
                        {visibleSalary.map((s) => (
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
                      {salary.length > visibleSalaryCount && (
                        <button
                          type="button"
                          onClick={() => setVisibleSalaryCount((v) => v + 10)}
                          className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                        >
                          {`Mer (${salary.length - visibleSalaryCount})`}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Inntekter</p>
                  {showIncomeForm ? (
                    <EntryForm
                      config={ACCOUNTING_FIELDS}
                      initial={emptyAccountingForm()}
                      onCancel={() => setShowIncomeForm(false)}
                      onSave={(form) => handleAddAccounting("inntekt", form)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowIncomeForm(true)}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                    >
                      <span className="text-base leading-none">+</span> Ny inntekt
                    </button>
                  )}
                  {income.length === 0 ? (
                    <p className="text-sm text-ink-3">Ingen inntekter lagt inn ennå.</p>
                  ) : (
                    <>
                      <ul className="flex flex-col gap-1.5">
                        {visibleIncome.map((e) => (
                          <AccountingRow
                            key={e.id}
                            entry={e}
                            editing={editingIncomeId === e.id}
                            onStartEdit={setEditingIncomeId}
                            onCancelEdit={() => setEditingIncomeId(null)}
                            onSaveEdit={(id, form) => handleSaveAccountingEdit("inntekt", id, form)}
                            onRemove={(id) => confirmDelete.request({ type: "accounting", id })}
                          />
                        ))}
                      </ul>
                      {income.length > visibleIncomeCount && (
                        <button
                          type="button"
                          onClick={() => setVisibleIncomeCount((v) => v + 10)}
                          className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                        >
                          {`Mer (${income.length - visibleIncomeCount})`}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Utgifter</p>
                  {showExpenseForm ? (
                    <EntryForm
                      config={ACCOUNTING_FIELDS}
                      initial={emptyAccountingForm()}
                      onCancel={() => setShowExpenseForm(false)}
                      onSave={(form) => handleAddAccounting("utgift", form)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowExpenseForm(true)}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
                    >
                      <span className="text-base leading-none">+</span> Ny utgift
                    </button>
                  )}
                  {expenses.length === 0 ? (
                    <p className="text-sm text-ink-3">Ingen utgifter lagt inn ennå.</p>
                  ) : (
                    <>
                      <ul className="flex flex-col gap-1.5">
                        {visibleExpenses.map((e) => (
                          <AccountingRow
                            key={e.id}
                            entry={e}
                            editing={editingExpenseId === e.id}
                            onStartEdit={setEditingExpenseId}
                            onCancelEdit={() => setEditingExpenseId(null)}
                            onSaveEdit={(id, form) => handleSaveAccountingEdit("utgift", id, form)}
                            onRemove={(id) => confirmDelete.request({ type: "accounting", id })}
                          />
                        ))}
                      </ul>
                      {expenses.length > visibleExpenseCount && (
                        <button
                          type="button"
                          onClick={() => setVisibleExpenseCount((v) => v + 10)}
                          className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                        >
                          {`Mer (${expenses.length - visibleExpenseCount})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
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
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={(() => {
          const pending = confirmDelete.pending;
          if (!pending) return "";
          if (pending.type === "loan") return `Slette lånet «${loans.find((l) => l.id === pending.id)?.name ?? ""}»?`;
          if (pending.type === "savings")
            return `Slette sparekontoen «${savings.find((s) => s.id === pending.id)?.name ?? ""}»?`;
          if (pending.type === "salary")
            return `Slette lønnsoppføringen for «${salary.find((s) => s.id === pending.id)?.person ?? ""}»?`;
          const entry = accounting.find((e) => e.id === pending.id);
          const label = entry?.type === "utgift" ? "utgiften" : "inntekten";
          return `Slette ${label} «${entry?.description ?? ""}»?`;
        })()}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          if (pending.type === "loan") handleRemoveLoan(pending.id);
          else if (pending.type === "savings") handleRemoveSavings(pending.id);
          else if (pending.type === "salary") handleRemoveSalary(pending.id);
          else handleRemoveAccounting(pending.id);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
