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
// uavhengig av de andre Demokunde-nummerseriene brukt andre steder i appen.
export function anonymizeTenantName(navn: string): string {
  let hash = 0;
  for (let i = 0; i < navn.length; i++) hash = (hash * 31 + navn.charCodeAt(i)) >>> 0;
  return `Demokunde ${(hash % 500) + 1}`;
}

export function anonymizeIfPerson(navn: string): string {
  return looksLikeOrganization(navn) ? navn : anonymizeTenantName(navn);
}
