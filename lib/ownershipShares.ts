import ownershipSharesJson from "./data/ownership-shares.json";

// Typed wrapper rundt lib/data/ownership-shares.json - delt kilde med scripts/lib/refresh-helpers.js
// (Node require av samme JSON-fil). Se filens eget "notat"-felt for hvorfor dette er én delt
// kilde og ikke en hardkodet liste pr build-script.
export interface OwnershipShareBuilding {
  bygg: string;
  andel: number;
}

export interface OwnershipShareCompany {
  selskap: string;
  andel: number;
}

export const OWNERSHIP_SHARES: OwnershipShareBuilding[] = ownershipSharesJson.buildings;
export const OWNERSHIP_SHARES_SELSKAPER: OwnershipShareCompany[] = ownershipSharesJson.selskaper;

// Matcher på substreng (case-insensitive) - bygg-navn fra ulike kilder har ofte et suffiks
// (f.eks. "Strandveien 4-8 Uteparkering"), ikke bare eksakt likhet.
export function andelForBygg(byggNavn: string): number {
  const norm = byggNavn.toLowerCase();
  const match = OWNERSHIP_SHARES.find((r) => norm.includes(r.bygg.toLowerCase()));
  return match ? match.andel : 1;
}

// Selskaps-nivå eierandel (eksakt match) - brukes FØR andelForBygg der selskapet er kjent,
// se "notat"-feltet i lib/data/ownership-shares.json for hvorfor.
export function andelForSelskap(selskapNavn: string): number | null {
  const match = OWNERSHIP_SHARES_SELSKAPER.find((r) => r.selskap.toLowerCase() === selskapNavn.toLowerCase());
  return match ? match.andel : null;
}
