import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = [
  "/",
  "/upload-logs",
  "/live-tail",
  "/anomalies",
  "/incidents",
  "/reports",
  "/integrations",
  "/settings"
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = request.cookies.get("loglens_access")?.value;
  const refresh = request.cookies.get("loglens_refresh")?.value;
  const hasAuth = Boolean(access || refresh);

  if (isProtectedPath(pathname) && !hasAuth) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/login" || pathname === "/register") && hasAuth) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"]
};
