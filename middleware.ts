import { NextResponse } from "next/server";

// PIN-innlogging midlertidig avslått på Mortens forespørsel.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
