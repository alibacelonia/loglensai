import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const REPORTS_PROXY_TIMEOUT_MS = 20_000;

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/reports",
    method: "GET",
    timeoutMs: REPORTS_PROXY_TIMEOUT_MS
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as { analysis_id?: unknown; format?: unknown };
  return proxyAuthenticatedJson({
    request,
    path: "/api/reports",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      analysis_id: payload.analysis_id,
      format: payload.format
    }),
    timeoutMs: REPORTS_PROXY_TIMEOUT_MS
  });
}
