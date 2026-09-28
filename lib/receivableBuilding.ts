import { TENANTS } from "./tenants";
import { CONTRACTS, EXPIRIES } from "./widgets";
import { finnLeietakerFact, normaliserLeietakerNavn } from "./leietakerFactsLookup";

function likLeietaker(a: string, b: string): boolean {
  return normaliserLeietakerNavn(a) === normaliserLeietakerNavn(b);
}

// Bygg-oppslag for Kundefordringer (2026-09-26, Morten: "finn bygg fra der du finner bygg pr
// leietaker i andre tabeller") - kombinerer datasett som allerede har et bygg-felt PR LEIETAKER,
// i fallende dekningsrekkefølge: TENANTS (Oppslag sin egen kontonavn->bygg, kuratert men få
// rader), CONTRACTS (149 rader, størst dekning blant de tre gamle), EXPIRIES (kun leietakere med
// kontraktslinjer i utløpsvinduet), og til sist `leietakerFacts` (2026-09-27, ekte Fazile-data for
// 355 aktive leietakere - lagt til 2026-09-28 for å dekke det de tre andre IKKE dekket alene:
// 277 av 400 kundefordringer-leietakere viste "Ukjent" før dette, ned til 73 med Fazile-
// fallbacken). Samme "HOVEDBYGG"-forenkling som EXPIRIES allerede gjorde: en leietaker med
// linjer i flere bygg får bare det FØRSTE treffet, ikke en full liste. Matcher normalisert
// (stor/liten bokstav og mellomrom-varianter) på alle fire - se normaliserLeietakerNavn.
export function getMainBuilding(leietaker: string): string {
  const fraTenants = TENANTS.find((t) => likLeietaker(t.kontonavn, leietaker))?.bygg;
  if (fraTenants) return fraTenants;
  const fraContracts = CONTRACTS.find((c) => likLeietaker(c.kunde, leietaker))?.bygg;
  if (fraContracts) return fraContracts;
  const fraExpiries = EXPIRIES.find((t) => likLeietaker(t.leietaker, leietaker))?.bygg;
  if (fraExpiries) return fraExpiries;
  const fraFacts = finnLeietakerFact(leietaker)?.bygg;
  if (fraFacts) return fraFacts;
  return "Ukjent";
}
