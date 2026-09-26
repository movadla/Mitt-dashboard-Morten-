import { TENANTS } from "./tenants";
import { CONTRACTS, EXPIRIES } from "./widgets";

// Bygg-oppslag for Kundefordringer (2026-09-26, Morten: "finn bygg fra der du finner bygg pr
// leietaker i andre tabeller") - kombinerer de tre eksisterende datasettene som allerede har et
// bygg-felt PR LEIETAKER, i fallende dekningsrekkefølge: TENANTS (Oppslag sin egen
// kontonavn->bygg, kuratert men få rader), CONTRACTS (149 rader, størst dekning), EXPIRIES (kun
// leietakere med kontraktslinjer i utløpsvinduet). Matcher på eksakt leietakernavn i alle tre -
// samme "HOVEDBYGG"-forenkling som EXPIRIES allerede gjorde: en leietaker med linjer i flere bygg
// får bare det FØRSTE treffet, ikke en full liste. Ingen av de tre dekker alle 400
// kundefordringer-leietakerne alene - "Ukjent" er fortsatt reelt for resten, se gjøremål om ekte
// data fra Fazile rent_roll for full dekning.
export function getMainBuilding(leietaker: string): string {
  const fraTenants = TENANTS.find((t) => t.kontonavn === leietaker)?.bygg;
  if (fraTenants) return fraTenants;
  const fraContracts = CONTRACTS.find((c) => c.kunde === leietaker)?.bygg;
  if (fraContracts) return fraContracts;
  const fraExpiries = EXPIRIES.find((t) => t.leietaker === leietaker)?.bygg;
  if (fraExpiries) return fraExpiries;
  return "Ukjent";
}
