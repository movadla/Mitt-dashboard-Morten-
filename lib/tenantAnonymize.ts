// Delt anonymiseringslogikk for leietaker-drilldown-data lagret i Redis (NXT og Fazile).
// Se ANONYMISERING.md: samme Redis brukes lokalt og i prod, så ekte personnavn må
// anonymiseres ved lesing i produksjon - bedriftsnavn er ikke sensitive og vises som de er.

// Grov, bevisst konservativ heuristikk: "ser ut som et firma/organisasjon" krever et
// gjenkjennelig selskapsformkjennetegn eller institusjonsord. Alt som IKKE treffer her
// blir behandlet som mulig privatperson og anonymisert i prod - default er "anonymiser",
// ikke "vis", nettopp for å unngå å eksponere ekte personnavn ved usikkerhet.
const ORG_PATTERN =
  /\b(AS|ASA|DA|ANS|BA|NUF|ENK|SA|KS)\b|kommune|forening|klubb|sameie|selskap|stiftelse|menighet|departementet|direktoratet|universitet|skole|kirke|idrettslag|musikkorps|borettslag|komit[eè]|nemnda|byr[åa]|etat|turistforening|gmbh|ltd\.?/i;

export function looksLikeOrganization(navn: string): boolean {
  return ORG_PATTERN.test(navn);
}

// Deterministisk basert på navnet (samme leietaker => samme Demokunde-nummer hver gang),
// uavhengig av de andre Demokunde-nummerseriene brukt andre steder i appen. Modulus bumpet
// fra 500 til 100 000 (2026-09-07): med trolig flere hundre reelle privatperson-leietakere
// var kollisjon (to ulike ekte leietakere => samme Demokunde-nummer, altså slått sammen til
// én rad i den anonymiserte prod-visningen) statistisk sannsynlig i et 500-stort romm
// (bursdagsparadokset). Påvirker kun demo-/prod-visningen, ikke Mortens egen ekte visning.
export function anonymizeTenantName(navn: string): string {
  let hash = 0;
  for (let i = 0; i < navn.length; i++) hash = (hash * 31 + navn.charCodeAt(i)) >>> 0;
  return `Demokunde ${(hash % 100_000) + 1}`;
}

export function anonymizeIfPerson(navn: string): string {
  return looksLikeOrganization(navn) ? navn : anonymizeTenantName(navn);
}

// Delt vakt for "anonymiser KUN i produksjon" - samme Redis brukes lokalt (ekte data ønsket)
// og på den offentlige Vercel-siden (kun demokunder tillatt), se ANONYMISERING.md. Var
// tidligere en nesten ordrett kopiert `if (NODE_ENV === "production") return anonymize(x)`
// i 4+ lib-filer (contractExpiry2026.ts, omsetningsavregning.ts, tenantForecastTable.ts,
// incomeForecastRemainingTenants.ts) - én delt hjelper her fjerner duplisering OG hindrer
// strukturelt at en NY snapshot-getter glemmer sjekken.
export function withProdAnonymization<T>(value: T, anonymize: (value: T) => T): T {
  return process.env.NODE_ENV === "production" ? anonymize(value) : value;
}
