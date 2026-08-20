// Anonymisert fallback — committed til git, brukes alltid i produksjonsbygg
// (se scripts/use-anon-data.js) og når lib/companyInfo.ts ikke peker på
// companyInfo.local.ts. Ekte navn/titler ligger ALDRI her — kun i den
// gitignorede lib/companyInfo.local.ts. Samme mønster som tenants.anon.ts.

export interface CompanyInfoEntry {
  id: string;
  category: "historie" | "selskap" | "utvikling" | "annet";
  title: string;
  body: string;
  updatedAt: string;
  sourceRef?: string;
}

export interface Employee {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
}

export const COMPANY_INFO: CompanyInfoEntry[] = [
  {
    id: "hist-1",
    category: "historie",
    title: "Eksempel: selskapets historie",
    body: "Placeholder — se lib/companyInfo.local.ts for ekte innhold (kun lokalt, ikke committed).",
    updatedAt: "2026-08-19",
  },
];

export const EMPLOYEES: Employee[] = [
  { id: "demo-1", name: "Ansatt 1", title: "Eksempeltittel", department: "Eksempelavdeling" },
  { id: "demo-2", name: "Ansatt 2", title: null, department: "Eksempelavdeling" },
];
