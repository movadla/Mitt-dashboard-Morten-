import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const auth = request.cookies.get("auth")?.value;
  if (auth === process.env.AUTH_SECRET) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // api/backup, api/cron, api/company-news og api/jobb-suggestions har sin
  // egen autorisering (cookie ELLER CRON_SECRET) siden planlagte jobber/
  // Claude-økter uten nettleser-cookie må kunne nå dem — se
  // app/api/backup/route.ts, app/api/cron/receivables-snapshot/route.ts,
  // app/api/company-news/route.ts og app/api/jobb-suggestions/route.ts.
  matcher: ["/((?!login|api/auth|api/backup|api/cron|api/company-news|api/jobb-suggestions|_next/static|_next/image|favicon.ico).*)"],
};
