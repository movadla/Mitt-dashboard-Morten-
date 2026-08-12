import type { IncomeForecastPart } from "./incomeForecastManual";

// Egen formatKr her (ikke import fra ./widgets) for å unngå sirkulær import:
// widgets.local.ts kaller buildIncomeForecastContext() herfra via lib/incomeForecast.ts.
function formatKr(n: number): string {
  return `${n.toLocaleString("nb-NO")} kr`;
}

export interface InvoicedPeriodTotal {
  periode: string; // "YYYY-MM"
  delA: number; // netto fakturert leie (3600-3699 ekskl. 3640/41/42)
  delB: number; // netto fakturert parkering (3640/41/42)
}

export interface InvoicedSnapshot {
  sistOppdatert: string; // "YYYY-MM-DD"
  ar: number;
  periods: InvoicedPeriodTotal[];
}

export const INVOICED: InvoicedSnapshot = {
  sistOppdatert: "",
  ar: 2026,
  periods: [],
};

export type RenewalCertainty = "sikker" | "usikker";

export interface RemainingContractLine {
  linjeId: number;
  beskrivelse: string;
  del: IncomeForecastPart;
  leietype: "RENT" | "DISCOUNT" | "CUSTOM_PARKERING";
  periodeFra: string;
  periodeTil: string; // reell kontraktsslutt, ELLER 31.12 hvis fornyelsesregelen er brukt
  belopGjenstaende: number;
  sikkerhet: RenewalCertainty;
  fornyelseAntatt: boolean; // true kun når sikkerhet === "usikker" via fornyelsesregelen
  originalSluttdato?: string; // linjens faktiske kontraktsslutt før antatt forlengelse
  nyKontraktsnokkel?: string; // satt når en reell signert etterfølgerkontrakt finnes
  nyKontraktStart?: string;
}

export interface RemainingTenantGroup {
  leietaker: string;
  customerId: number;
  bygg: string;
  lines: RemainingContractLine[];
}

export interface RemainingSnapshot {
  sistOppdatert: string;
  ar: number;
  tenants: RemainingTenantGroup[];
}

export const REMAINING: RemainingSnapshot = {
  sistOppdatert: "",
  ar: 2026,
  tenants: [],
};

export interface ManualNxtVoucher {
  bilagsnr: string;
  dato: string;
  periode: string; // "YYYY-MM"
  konto: string;
  bygg: string;
  del: IncomeForecastPart;
  belop: number;
  kategori: string;
  tekst: string;
}

export interface ManualNxtSnapshot {
  sistOppdatert: string;
  ar: number;
  vouchers: ManualNxtVoucher[];
}

export const MANUAL_NXT: ManualNxtSnapshot = {
  sistOppdatert: "",
  ar: 2026,
  vouchers: [],
};

export type ReconciliationStatus = "ok" | "varsel" | "feil";

export interface ReconciliationCheck {
  id: string;
  label: string;
  status: ReconciliationStatus;
  notat: string;
}

export interface ReconciliationSnapshot {
  sistOppdatert: string;
  checks: ReconciliationCheck[];
}

export const RECONCILIATION: ReconciliationSnapshot = {
  sistOppdatert: "",
  checks: [],
};

export function buildIncomeForecastContext(): string {
  const lines: string[] = [];

  const invoicedA = INVOICED.periods.reduce((s, p) => s + p.delA, 0);
  const invoicedB = INVOICED.periods.reduce((s, p) => s + p.delB, 0);
  lines.push(
    `INNTEKTSPROGNOSE ${INVOICED.ar} (snapshot, sist oppdatert ${INVOICED.sistOppdatert || "ukjent"} — ikke live, oppdateres manuelt ved forespørsel):`,
  );
  lines.push(`- Fakturert hittil (Visma NXT): Del A (leie) ${formatKr(invoicedA)}, Del B (parkering) ${formatKr(invoicedB)}`);

  const manualNxtA = MANUAL_NXT.vouchers.filter((v) => v.del === "A").reduce((s, v) => s + v.belop, 0);
  const manualNxtB = MANUAL_NXT.vouchers.filter((v) => v.del === "B").reduce((s, v) => s + v.belop, 0);
  lines.push(`- Manuelle bilag allerede i NXT: Del A ${formatKr(manualNxtA)}, Del B ${formatKr(manualNxtB)} (${MANUAL_NXT.vouchers.length} bilag)`);

  const remainingLines = REMAINING.tenants.flatMap((t) => t.lines);
  const remainingSikker = remainingLines.filter((l) => l.sikkerhet === "sikker").reduce((s, l) => s + l.belopGjenstaende, 0);
  const remainingUsikker = remainingLines.filter((l) => l.sikkerhet === "usikker").reduce((s, l) => s + l.belopGjenstaende, 0);
  lines.push(
    `- Gjenstår å fakturere resten av året (Fazile, ${REMAINING.tenants.length} leietakere): sikkert ${formatKr(remainingSikker)}, usikkert/antatt fornyelse ${formatKr(remainingUsikker)}`,
  );

  lines.push("\nAVSTEMMINGSKONTROLLER:");
  if (RECONCILIATION.checks.length === 0) {
    lines.push("- Ingen kontroller kjørt ennå.");
  } else {
    for (const c of RECONCILIATION.checks) {
      lines.push(`- [${c.status}] ${c.label}: ${c.notat}`);
    }
  }

  return lines.join("\n");
}
