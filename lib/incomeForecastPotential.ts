import { hgetallJSON, hsetJSON } from "./kv";
import { localDateString } from "./payday";

// Manuelt anslåtte "potensielle inntekt"-kategorier i Inntektsprognose-toppseksjonen -
// tall Morten legger inn selv (2026-08-24/25) i påvente av at de kobles til ekte
// datakilder/rapporter senere (ledige lokaler -> Fazile arealoversikt x markedsleie;
// annet -> ukjent ennå; potensiell fremtidig inntekt -> ad-hoc gravd fram fra Fazile
// SIGNED_BY_BOTH_PARTIES-kontrakter som ennå ikke er i REMAINING-snapshotet, ikke
// automatiserbart på samme måte som de andre datalagene).
// "omsetningsavregning" er IKKE lenger en manuell kategori her (2026-08-24) - den er
// erstattet av et beregnet tall fra lib/omsetningsavregning.ts (se OmsetningsavregningBlock
// i app/IncomeForecastSection.tsx). IKKE forveksle med den allerede BOKFØRTE
// "Omsetningsleie-avsetning"-reverseringen i MANUAL_NXT (-12,14 mill kr, gjelder 2025) -
// to helt forskjellige ting som begge nevner "omsetningsleie".
export type PotentialIncomeCategoryKey = "potensiell-fremtidig-inntekt" | "ledige-lokaler" | "annet";

export interface PotentialIncomeCategory {
  key: PotentialIncomeCategoryKey;
  label: string;
  belop: number;
  notat: string;
  sistOppdatert: string;
}

export interface PotentialIncomeSnapshot {
  categories: PotentialIncomeCategory[];
}

const HASH_KEY = "jobb:inntektsprognose-potensial";

const DEFAULTS: Record<PotentialIncomeCategoryKey, Omit<PotentialIncomeCategory, "sistOppdatert">> = {
  "potensiell-fremtidig-inntekt": {
    key: "potensiell-fremtidig-inntekt",
    label: "Potensiell fremtidig inntekt",
    belop: 0,
    // IKKE legg ekte leietaker-/kundenavn i denne default-teksten (committet kode, se
    // ANONYMISERING.md) - det reelle anslaget og notatet (med navn) settes via Redis
    // (PATCH-endepunktet eller et engangs-seed-script), ikke her.
    notat: "Foreløpig manuelt anslag - samlepost for signerte, men ikke Fazile-registrerte kontrakter/leieforhold.",
  },
  "ledige-lokaler": {
    key: "ledige-lokaler",
    label: "Ledige lokaler",
    belop: 0,
    notat: "Foreløpig manuelt anslag - ikke koblet til Fazile sin arealoversikt/ledighetsdata ennå.",
  },
  annet: {
    key: "annet",
    label: "Annet",
    belop: 0,
    notat: "Foreløpig manuelt anslag - samlepost for annen potensiell inntekt som ikke passer de andre kategoriene.",
  },
};

const ORDER: PotentialIncomeCategoryKey[] = ["potensiell-fremtidig-inntekt", "ledige-lokaler", "annet"];

export async function getPotentialIncomeSnapshot(): Promise<PotentialIncomeSnapshot> {
  const stored = await hgetallJSON<PotentialIncomeCategory>(HASH_KEY);
  const categories = ORDER.map((key) => {
    const existing = stored[key];
    if (existing) return existing;
    return { ...DEFAULTS[key], sistOppdatert: localDateString() };
  });
  return { categories };
}

export async function updatePotentialIncomeCategory(
  key: PotentialIncomeCategoryKey,
  updates: { belop?: number; notat?: string },
): Promise<PotentialIncomeCategory> {
  if (!ORDER.includes(key)) throw new Error("Ukjent kategori");
  const stored = await hgetallJSON<PotentialIncomeCategory>(HASH_KEY);
  const current = stored[key] ?? { ...DEFAULTS[key], sistOppdatert: localDateString() };

  if (updates.belop !== undefined && (typeof updates.belop !== "number" || !Number.isFinite(updates.belop))) {
    throw new Error("Ugyldig beløp");
  }

  const next: PotentialIncomeCategory = {
    ...current,
    belop: updates.belop !== undefined ? updates.belop : current.belop,
    notat: updates.notat !== undefined ? updates.notat.trim() : current.notat,
    sistOppdatert: localDateString(),
  };
  await hsetJSON(HASH_KEY, key, next);
  return next;
}
