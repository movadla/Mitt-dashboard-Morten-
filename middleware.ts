import { NextRequest, NextResponse } from "next/server";

// v1 (2026-09-23, Morten: dele Inntektsprognosen med økonomisjef/utleiesjef uten full
// dashboard-tilgang): eget passord (DELE_SECRET, cookie "dele_auth") som KUN slipper til
// /dele/* og et fast, GET-only sett API-ruter Inntektsprognose-seksjonen faktisk leser fra.
// Aldri resten av appen, og aldri en mutasjons-rute (POST/PATCH/PUT/DELETE) - selv om
// IncomeForecastSection sine kommentar-/vurderings-knapper fortsatt vises for en delt bruker,
// vil selve lagringskallet bli avvist her og feile stille (samme "svelg feilen"-mønster som
// resten av appen bruker ved mislykkede UI-mutasjoner).
// Hold i sync med fetch(...)-kallene i app/IncomeForecastSection.tsx hvis nye API-ruter
// legges til der.
const DELE_TILLATTE_GET_API = new Set([
  "/api/income-forecast/booked-tenants",
  "/api/income-forecast/contract-expiry-2026",
  "/api/income-forecast/contract-expiry-2026-parkering",
  // v76 (2026-09-25, revisjonsrunde 2): de to under manglet - "Eksporter til Excel"-knappene ville
  // ha feilet stille for en /dele-bruker (redirect til /login i stedet for xlsx-fil). Begge er
  // rene GET-er som allerede går via de anonymiserende snapshot-getterne, så trygt å legge til.
  "/api/income-forecast/contract-expiry-2026/export",
  "/api/income-forecast/remaining-tenants/export",
  "/api/income-forecast/history",
  "/api/income-forecast/manual-lines",
  "/api/income-forecast/nxt-budget",
  "/api/income-forecast/omsetningsavregning",
  "/api/income-forecast/potential",
  "/api/income-forecast/remaining-tenants",
  "/api/income-forecast/review-marks",
  "/api/income-forecast/tenant-comments",
  "/api/income-forecast/tenant-forecast-table",
  "/api/income-forecast/tenant-signals",
  "/api/income-forecast/vacant-areas",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const auth = request.cookies.get("auth")?.value;
  const secret = process.env.AUTH_SECRET;
  // `auth` og `secret` kan begge være `undefined` (secret usatt i et miljø, f.eks. en
  // Vercel-preview uten env-var) - `undefined === undefined` ville da sluppet gjennom UTEN
  // cookie i det hele tatt. `secret` må derfor eksistere og ha innhold før sammenligningen.
  if (secret && auth === secret) return NextResponse.next();

  const deleAuth = request.cookies.get("dele_auth")?.value;
  const deleSecret = process.env.DELE_SECRET;
  if (deleSecret && deleAuth === deleSecret) {
    if (pathname.startsWith("/dele")) return NextResponse.next();
    if (request.method === "GET" && DELE_TILLATTE_GET_API.has(pathname)) return NextResponse.next();
  }
  if (pathname.startsWith("/dele")) {
    return NextResponse.redirect(new URL("/dele/logg-inn", request.url));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // api/backup, api/cron, api/company-news, api/jobb-suggestions og
  // api/voice-command har sin egen autorisering (cookie ELLER et eget
  // bearer-secret) siden planlagte jobber/Claude-økter/en iOS-snarvei uten
  // nettleser-cookie må kunne nå dem — se app/api/backup/route.ts,
  // app/api/cron/receivables-snapshot/route.ts, app/api/company-news/route.ts,
  // app/api/jobb-suggestions/route.ts og app/api/voice-command/route.ts.
  // dele/logg-inn og api/dele-auth er den delte visningens EGEN innloggingsside/-rute -
  // samme unntaksbehov som login/api/auth over (ellers uendelig redirect-løkke).
  matcher: [
    "/((?!login|dele/logg-inn|api/auth|api/dele-auth|api/backup|api/cron|api/company-news|api/jobb-suggestions|api/voice-command|_next/static|_next/image|favicon.ico).*)",
  ],
};
