import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const auth = request.cookies.get("auth")?.value;
  if (auth === process.env.AUTH_SECRET) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // api/backup, api/cron, api/company-news, api/jobb-suggestions og
  // api/voice-command har sin egen autorisering (cookie ELLER et eget
  // bearer-secret) siden planlagte jobber/Claude-økter/en iOS-snarvei uten
  // nettleser-cookie må kunne nå dem — se app/api/backup/route.ts,
  // app/api/cron/receivables-snapshot/route.ts, app/api/company-news/route.ts,
  // app/api/jobb-suggestions/route.ts og app/api/voice-command/route.ts.
  matcher: [
    "/((?!login|api/auth|api/backup|api/cron|api/company-news|api/jobb-suggestions|api/voice-command|_next/static|_next/image|favicon.ico).*)",
  ],
};
