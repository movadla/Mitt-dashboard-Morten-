import { hgetallJSON, hsetJSON } from "./kv";
import { localDateString } from "./payday";

// Sannsynlighet for reforhandling (pr leieforhold) og utleie (pr ledig-lokale-prosjekt),
// bygget 2026-08-24 etter Morten sitt ønske om å kunne kommentere og justere en prosent pr
// leietaker/ledig lokale selv. Seedet fra kontraktsutløp sitt eget "reforhandlet"-flagg og
// Salesforce Prosjekt__c (Reforhandling/Ledig lokale), men Mortens egen vurdering er
// hovedkilden - se lib/incomeForecast.local.ts sin "sf-prosjekt-data-foreldet"-sjekk for
// hvorfor SF-data alene IKKE er pålitelig nok til å stole blindt på.
export type TenantSignalType = "reforhandling" | "utleie";

export interface TenantSignal {
  id: string; // kontraktsnokkel (reforhandling) eller SF Prosjekt__c Id (utleie)
  type: TenantSignalType;
  navn: string;
  bygg: string;
  sannsynlighetProsent: number; // 0-100
  notat: string;
  kilde: string;
  sistOppdatert: string;
}

const HASH_KEY = "jobb:inntektsprognose-signaler";

export async function getTenantSignals(): Promise<TenantSignal[]> {
  const map = await hgetallJSON<TenantSignal>(HASH_KEY);
  return Object.values(map);
}

// Upsert: hvis id ikke finnes fra før, må type/navn/bygg være med i "updates" for å
// opprette et nytt signal (brukt av "Sett sannsynlighet"-knappen på leieforhold/lokaler
// som ikke har blitt seedet av scripts/build-tenant-signals.js).
export async function updateTenantSignal(
  id: string,
  updates: {
    sannsynlighetProsent?: number;
    notat?: string;
    type?: TenantSignalType;
    navn?: string;
    bygg?: string;
  },
): Promise<TenantSignal | null> {
  const map = await hgetallJSON<TenantSignal>(HASH_KEY);
  const current = map[id];
  if (!current && (!updates.type || !updates.navn)) return null;
  if (updates.sannsynlighetProsent !== undefined) {
    if (!Number.isFinite(updates.sannsynlighetProsent) || updates.sannsynlighetProsent < 0 || updates.sannsynlighetProsent > 100) {
      throw new Error("Sannsynlighet må være mellom 0 og 100");
    }
  }
  const base: TenantSignal = current ?? {
    id,
    type: updates.type as TenantSignalType,
    navn: updates.navn as string,
    bygg: updates.bygg ?? "",
    sannsynlighetProsent: 0,
    notat: "",
    kilde: "Manuelt (Morten)",
    sistOppdatert: localDateString(),
  };
  const next: TenantSignal = {
    ...base,
    sannsynlighetProsent: updates.sannsynlighetProsent !== undefined ? updates.sannsynlighetProsent : base.sannsynlighetProsent,
    notat: updates.notat !== undefined ? updates.notat.trim() : base.notat,
    kilde: updates.sannsynlighetProsent !== undefined || updates.notat !== undefined ? "Manuelt (Morten)" : base.kilde,
    sistOppdatert: localDateString(),
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}
