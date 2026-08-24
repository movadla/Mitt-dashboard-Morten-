import { hgetallJSON, hsetJSON } from "./kv";
import { localDateString } from "./payday";

// Manuelt anslåtte "potensielle inntekt"-kategorier i Inntektsprognose-toppseksjonen -
// tall Morten legger inn selv (2026-08-24) i påvente av at de kobles til ekte
// datakilder/rapporter senere (omsetningsavregning -> Fenistra, steg 3 i roadmapen;
// ledige lokaler -> Fazile arealoversikt x markedsleie; annet -> ukjent ennå).
// IKKE forveksle "omsetningsavregning" her (fremover-rettet, 2026) med den allerede
// BOKFØRTE "Omsetningsleie-avsetning"-reverseringen i MANUAL_NXT (-12,14 mill kr,
// gjelder 2025) - to helt forskjellige ting som begge nevner "omsetningsleie".
export type PotentialIncomeCategoryKey = "omsetningsavregning" | "ledige-lokaler" | "annet";

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
  omsetningsavregning: {
    key: "omsetningsavregning",
    label: "Omsetningsavregning",
    belop: 10000000,
    notat:
      "Foreløpig manuelt anslag - erstattes med ekte tall fra Fenistra når omsetningsleie-avregningen (steg 3 i inntektsprognose-roadmapen) er bygget.",
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

const ORDER: PotentialIncomeCategoryKey[] = ["omsetningsavregning", "ledige-lokaler", "annet"];

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
