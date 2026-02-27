import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const ANOMALIES_PROXY_TIMEOUT_MS = 20_000;

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/anomalies",
    method: "GET",
    timeoutMs: ANOMALIES_PROXY_TIMEOUT_MS
  });
}
