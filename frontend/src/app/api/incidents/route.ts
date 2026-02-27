import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const INCIDENTS_PROXY_TIMEOUT_MS = 20_000;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const suffix = query ? `?${query}` : "";
  return proxyAuthenticatedJson({
    request,
    path: `/api/incidents${suffix}`,
    method: "GET",
    timeoutMs: INCIDENTS_PROXY_TIMEOUT_MS
  });
}
