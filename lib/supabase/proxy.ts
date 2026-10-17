import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can visit without logging in. Everything else requires a session.
const PUBLIC_PATHS = ["/login", "/signup", "/pricing", "/auth"];
// Pages a logged-in user has no reason to see.
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Refreshes the Supabase session cookie on every request and redirects
// logged-out users away from protected pages. Called from /proxy.ts.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Don't put code between createServerClient and getClaims(): this call is
  // what refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  // API routes handle auth themselves (JSON 401s, Stripe webhook has no session).
  if (pathname.startsWith("/api/")) return response;

  if (!isLoggedIn && !matches(pathname, PUBLIC_PATHS)) {
    return redirectWithCookies(request, response, "/login");
  }
  if (isLoggedIn && matches(pathname, AUTH_PAGES)) {
    return redirectWithCookies(request, response, "/");
  }

  return response;
}

// Redirect while keeping any refreshed session cookies, so the user isn't logged out.
function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
