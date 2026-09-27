import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/account", "/agent", "/admin"];

// Cheap edge-level check: if there's no refresh-token cookie at all, bounce to
// login before the page even loads. Fine-grained role checks (which role a
// logged-in user actually has) happen client-side via RoleGuard, backed by the
// real enforcement point: the Express API's requireAuth/requireRole middleware.
export function middleware(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  if (!request.cookies.has("refresh_token")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/agent/:path*", "/admin/:path*"],
};
