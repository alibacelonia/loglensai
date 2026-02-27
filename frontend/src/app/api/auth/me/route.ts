import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const ME_PROXY_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/me",
    method: "GET",
    timeoutMs: ME_PROXY_TIMEOUT_MS
  });
}
