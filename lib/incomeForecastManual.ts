import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// A = leie (kontogruppe 3600-3699 ekskl. 3640/3641/3642), B = parkering (3640/3641/3642)
export type IncomeForecastPart = "A" | "B";

export type ManualLineConfidence = "høy" | "middels" | "lav";

export interface ManualIncomeLine {
  id: string;
  beskrivelse: string;
  selskap: string;
  bygg: string;
  konto: string;
  del: IncomeForecastPart;
  belop: number;
  periodeFra: string; // "YYYY-MM-DD"
  periodeTil: string; // "YYYY-MM-DD"
  kilde?: string;
  sikkerhet: ManualLineConfidence;
  aktiv: boolean;
}

export interface NewManualIncomeLineInput {
  beskrivelse: string;
  selskap: string;
  bygg: string;
  konto: string;
  del: IncomeForecastPart;
  belop: number;
  periodeFra: string;
  periodeTil: string;
  kilde?: string;
  sikkerhet: ManualLineConfidence;
  aktiv?: boolean;
}

export interface ManualIncomeLineUpdateInput {
  beskrivelse?: string;
  selskap?: string;
  bygg?: string;
  konto?: string;
  del?: IncomeForecastPart;
  belop?: number;
  periodeFra?: string;
  periodeTil?: string;
  kilde?: string | null;
  sikkerhet?: ManualLineConfidence;
  aktiv?: boolean;
}

const HASH_KEY = "jobb:inntektsprognose-linjer";

function sortManualIncomeLines(lines: ManualIncomeLine[]): ManualIncomeLine[] {
  return [...lines].sort((a, b) => a.periodeFra.localeCompare(b.periodeFra));
}

export async function getManualIncomeLines(): Promise<ManualIncomeLine[]> {
  const map = await hgetallJSON<ManualIncomeLine>(HASH_KEY);
  return sortManualIncomeLines(Object.values(map));
}

export async function addManualIncomeLine(input: NewManualIncomeLineInput): Promise<ManualIncomeLine> {
  if (!input.beskrivelse?.trim()) throw new Error("Linje mangler beskrivelse");
  if (!input.selskap?.trim()) throw new Error("Linje mangler selskap");
  if (!input.bygg?.trim()) throw new Error("Linje mangler bygg");
  if (!input.konto?.trim()) throw new Error("Linje mangler konto");
  if (input.del !== "A" && input.del !== "B") throw new Error("Linje mangler gyldig del (A/B)");
  if (typeof input.belop !== "number" || !Number.isFinite(input.belop)) throw new Error("Linje mangler beløp");
  if (!input.periodeFra) throw new Error("Linje mangler periode fra");
  if (!input.periodeTil) throw new Error("Linje mangler periode til");
  if (!input.sikkerhet) throw new Error("Linje mangler sikkerhet");

  const line: ManualIncomeLine = {
    id: randomUUID(),
    beskrivelse: input.beskrivelse.trim(),
    selskap: input.selskap.trim(),
    bygg: input.bygg.trim(),
    konto: input.konto.trim(),
    del: input.del,
    belop: input.belop,
    periodeFra: input.periodeFra,
    periodeTil: input.periodeTil,
    kilde: input.kilde?.trim() || undefined,
    sikkerhet: input.sikkerhet,
    aktiv: input.aktiv ?? true,
  };
  await hsetJSON(HASH_KEY, line.id, line);
  return line;
}

export async function updateManualIncomeLine(
  id: string,
  updates: ManualIncomeLineUpdateInput,
): Promise<ManualIncomeLine | null> {
  const current = await hgetJSON<ManualIncomeLine>(HASH_KEY, id);
  if (!current) return null;

  const beskrivelse = updates.beskrivelse !== undefined ? updates.beskrivelse.trim() : current.beskrivelse;
  if (!beskrivelse) throw new Error("Linje mangler beskrivelse");
  const selskap = updates.selskap !== undefined ? updates.selskap.trim() : current.selskap;
  if (!selskap) throw new Error("Linje mangler selskap");
  const bygg = updates.bygg !== undefined ? updates.bygg.trim() : current.bygg;
  if (!bygg) throw new Error("Linje mangler bygg");
  const konto = updates.konto !== undefined ? updates.konto.trim() : current.konto;
  if (!konto) throw new Error("Linje mangler konto");

  const next: ManualIncomeLine = {
    ...current,
    beskrivelse,
    selskap,
    bygg,
    konto,
    del: updates.del !== undefined ? updates.del : current.del,
    belop: updates.belop !== undefined ? updates.belop : current.belop,
    periodeFra: updates.periodeFra !== undefined ? updates.periodeFra : current.periodeFra,
    periodeTil: updates.periodeTil !== undefined ? updates.periodeTil : current.periodeTil,
    kilde: updates.kilde !== undefined ? (updates.kilde ?? undefined) : current.kilde,
    sikkerhet: updates.sikkerhet !== undefined ? updates.sikkerhet : current.sikkerhet,
    aktiv: updates.aktiv !== undefined ? updates.aktiv : current.aktiv,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteManualIncomeLine(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
