import { EXPIRIES } from "./widgets";

// Midlertidig kilde til bygg-info: slår opp i EXPIRIES (som allerede har
// leietakerens HOVEDBYGG for de med kontraktslinjer som utløper i det
// vinduet EXPIRIES dekker). Matcher på eksakt leietakernavn — fungerer i
// både widgets.local.ts (ekte navn) og widgets.anon.ts (samme "Demokunde N"
// brukt konsekvent i begge datasett). Dekker sannsynligvis kun et mindretall
// av alle kundefordringer-leietakere — se gjøremål om å hente ekte data fra
// Fazile rent_roll for full dekning.
export function getMainBuilding(leietaker: string): string {
  const match = EXPIRIES.find((t) => t.leietaker === leietaker);
  return match?.bygg ?? "Ukjent";
}
