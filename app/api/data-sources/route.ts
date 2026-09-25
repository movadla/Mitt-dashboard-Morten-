import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import path from "path";
import { getAllCompanyNews } from "@/lib/companyNews";
import { CONTRACTS_SIST_OPPDATERT } from "@/lib/widgets";

export const dynamic = "force-dynamic";

// Hver oppføring peker på en manuelt oppdatert .local.ts-fil (se
// scripts/use-local-data.js / feedback_local-anon-data-swap.md-minnet) — vi
// leser filens faktiske sist-endret-tidspunkt på disk i stedet for å be
// Claude huske å oppdatere et eget "sist oppdatert"-felt hver gang, som
// uunngåelig hadde blitt glemt før eller senere. `lastModified: null` betyr
// at filen ikke finnes (f.eks. i et produksjonsbygg der .local.ts-filer
// aldri følger med, med vilje — se .gitignore).
const FILE_SOURCES: { id: string; label: string; file: string }[] = [
  { id: "tasks", label: "Oppgaver (SF/Asana/Outlook/Teams)", file: "tasks.local.ts" },
  { id: "tenants", label: "Leietakersøk (Oppslag)", file: "tenants.local.ts" },
  { id: "widgets", label: "Utløp / Garantier / Kundefordringer / Kalender", file: "widgets.local.ts" },
  { id: "incomeForecast", label: "Inntektsprognose", file: "incomeForecast.local.ts" },
  { id: "companyInfo", label: "Mustad — oppslagsverk", file: "companyInfo.local.ts" },
  { id: "fazilesjekk", label: "Fazilesjekk", file: "fazilesjekk.local.ts" },
];

export async function GET() {
  try {
    const fileResults = await Promise.all(
      FILE_SOURCES.map(async (s) => {
        try {
          const stats = await stat(path.join(process.cwd(), "lib", s.file));
          return { id: s.id, label: s.label, lastModified: stats.mtime.toISOString() };
        } catch {
          return { id: s.id, label: s.label, lastModified: null };
        }
      }),
    );

    const news = await getAllCompanyNews();
    const newsLastModified = news.length > 0 ? news.reduce((max, n) => (n.createdAt > max ? n.createdAt : max), news[0].createdAt) : null;

    return NextResponse.json({
      sources: [
        ...fileResults,
        // v77 (2026-09-26, presentasjonsrevisjon): "widgets"-fil-mtiden over dekker FEM ulike
        // datasett i samme fil - et blindt filstempel sier ingenting presist om ETT av dem.
        // Kontrakter fikk sin egen CONTRACTS_SIST_OPPDATERT-konstant (satt manuelt ved hver
        // Fazile-refresh, se scripts/build-new-contracts.js) nettopp for å unngå dette - bruk den
        // presise datoen her i stedet for fil-mtiden.
        { id: "contracts", label: "Kontrakter", lastModified: `${CONTRACTS_SIST_OPPDATERT}T00:00:00.000Z` },
        { id: "companyNews", label: "Mustad-nyheter", lastModified: newsLastModified },
      ],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
