import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface Loan {
  id: string;
  name: string; // f.eks. "Sb1 bk annuitet" eller "Fastrente 5 år annuitet"
  lender: string; // f.eks. "BN Bank"
  remainingAmount: number; // kr, gjenstående lånebeløp (positivt tall)
  originalAmount?: number;
  nominalRate?: number; // % nominell rente
  effectiveRate?: number; // % effektiv rente
  rateFixedUntil?: string; // "YYYY-MM-DD" — periode fastrente slutter
  nextPaymentDate?: string; // "YYYY-MM-DD"
  maturityDate?: string; // "YYYY-MM-DD" — innfrielsesdato
  coBorrower?: string;
}

export interface NewLoanInput {
  name: string;
  lender: string;
  remainingAmount: number;
  originalAmount?: number;
  nominalRate?: number;
  effectiveRate?: number;
  rateFixedUntil?: string;
  nextPaymentDate?: string;
  maturityDate?: string;
  coBorrower?: string;
}

export interface LoanUpdateInput {
  name?: string;
  lender?: string;
  remainingAmount?: number;
  originalAmount?: number | null;
  nominalRate?: number | null;
  effectiveRate?: number | null;
  rateFixedUntil?: string | null;
  nextPaymentDate?: string | null;
  maturityDate?: string | null;
  coBorrower?: string | null;
}

const HASH_KEY = "privat:loans";

function sortLoans(loans: Loan[]): Loan[] {
  return [...loans].sort((a, b) => b.remainingAmount - a.remainingAmount);
}

export async function getLoans(): Promise<Loan[]> {
  const map = await hgetallJSON<Loan>(HASH_KEY);
  return sortLoans(Object.values(map));
}

export async function addLoan(input: NewLoanInput): Promise<Loan> {
  if (!input.name?.trim()) throw new Error("Lån mangler navn");
  if (!input.lender?.trim()) throw new Error("Lån mangler bank");
  if (typeof input.remainingAmount !== "number" || Number.isNaN(input.remainingAmount)) {
    throw new Error("Lån mangler gjenstående beløp");
  }
  const loan: Loan = {
    id: randomUUID(),
    name: input.name.trim(),
    lender: input.lender.trim(),
    remainingAmount: input.remainingAmount,
    originalAmount: input.originalAmount,
    nominalRate: input.nominalRate,
    effectiveRate: input.effectiveRate,
    rateFixedUntil: input.rateFixedUntil,
    nextPaymentDate: input.nextPaymentDate,
    maturityDate: input.maturityDate,
    coBorrower: input.coBorrower,
  };
  await hsetJSON(HASH_KEY, loan.id, loan);
  return loan;
}

export async function updateLoan(id: string, updates: LoanUpdateInput): Promise<Loan | null> {
  const current = await hgetJSON<Loan>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Lån mangler navn");
  const lender = updates.lender !== undefined ? updates.lender.trim() : current.lender;
  if (!lender) throw new Error("Lån mangler bank");

  const next: Loan = {
    ...current,
    name,
    lender,
    remainingAmount: updates.remainingAmount !== undefined ? updates.remainingAmount : current.remainingAmount,
    originalAmount: updates.originalAmount !== undefined ? (updates.originalAmount ?? undefined) : current.originalAmount,
    nominalRate: updates.nominalRate !== undefined ? (updates.nominalRate ?? undefined) : current.nominalRate,
    effectiveRate: updates.effectiveRate !== undefined ? (updates.effectiveRate ?? undefined) : current.effectiveRate,
    rateFixedUntil: updates.rateFixedUntil !== undefined ? (updates.rateFixedUntil ?? undefined) : current.rateFixedUntil,
    nextPaymentDate: updates.nextPaymentDate !== undefined ? (updates.nextPaymentDate ?? undefined) : current.nextPaymentDate,
    maturityDate: updates.maturityDate !== undefined ? (updates.maturityDate ?? undefined) : current.maturityDate,
    coBorrower: updates.coBorrower !== undefined ? (updates.coBorrower ?? undefined) : current.coBorrower,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteLoan(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
