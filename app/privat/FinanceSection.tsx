"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, SkeletonRows, usePersistedCollapse } from "../CardShell";
import { formatDateDMY, formatKr } from "@/lib/widgets";
import type { Loan } from "@/lib/loans";
import { vibrate } from "@/lib/haptics";

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
        autoFocus
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
          {loan.originalAmount && loan.originalAmount > 0 && (() => {
            const paidDown = Math.min(1, Math.max(0, 1 - loan.remainingAmount / loan.originalAmount!));
            return (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent-privat" style={{ width: `${(paidDown * 100).toFixed(1)}%` }} />
                </div>
                <span className="shrink-0 text-2xs tabular-nums text-ink-4">{Math.round(paidDown * 100)}% nedbetalt</span>
              </div>
            );
          })()}
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

export default function FinanceSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Økonomi", true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/loans")
      .then((r) => r.json())
      .then((d) => setLoans((d.loans ?? []) as Loan[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function handleAdd(form: LoanFormValues) {
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToPayload(form)),
    });
    if (res.ok) {
      const created: Loan = await res.json();
      setLoans((prev) => [...prev, created].sort((a, b) => b.remainingAmount - a.remainingAmount));
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleSaveEdit(id: string, form: LoanFormValues) {
    const res = await fetch(`/api/loans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToPayload(form)),
    });
    if (res.ok) {
      const updated: Loan = await res.json();
      setLoans((prev) => prev.map((l) => (l.id === id ? updated : l)).sort((a, b) => b.remainingAmount - a.remainingAmount));
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleRemove(id: string) {
    setLoans((prev) => prev.filter((l) => l.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/loans/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  const totalRemaining = loans.reduce((sum, l) => sum + l.remainingAmount, 0);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Økonomi"
        subtitle={loans.length > 0 ? formatKr(totalRemaining) : "Ukentlig"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {showForm ? (
            <LoanForm initial={EMPTY_FORM} onCancel={() => setShowForm(false)} onSave={handleAdd} />
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              <span className="text-base leading-none">+</span> Nytt lån
            </button>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : loans.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen data lagt inn ennå. Her kommer lån, sparing og lønn.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {loans.map((l) => (
                <LoanRow
                  key={l.id}
                  loan={l}
                  editing={editingId === l.id}
                  onStartEdit={setEditingId}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
