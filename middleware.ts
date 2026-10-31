import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can open: the login page, the customer ordering site and the customer's order tracking page.
const PUBLIC = [/^\/login$/, /^\/order(\/|$)/, /^\/track\/[^/]+$/];

// Cheap first gate for staff pages: no session cookie → login. Real validation happens server-side in lib/auth.ts.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((re) => re.test(pathname));
  if (!isPublic && !req.cookies.has("fp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"] };
