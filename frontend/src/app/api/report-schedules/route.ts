import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const REPORT_SCHEDULE_TIMEOUT_MS = 20_000;

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/report-schedules",
    method: "GET",
    timeoutMs: REPORT_SCHEDULE_TIMEOUT_MS
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  return proxyAuthenticatedJson({
    request,
    path: "/api/report-schedules",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: REPORT_SCHEDULE_TIMEOUT_MS
  });
}
