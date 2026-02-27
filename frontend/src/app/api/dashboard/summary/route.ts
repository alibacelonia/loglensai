import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const DASHBOARD_SUMMARY_TIMEOUT_MS = 20_000;
const ALLOWED_WINDOWS = new Set(["24h", "7d", "30d"]);

export async function GET(request: NextRequest) {
  const requestedWindow = (request.nextUrl.searchParams.get("window") || "24h").trim().toLowerCase();
  if (!ALLOWED_WINDOWS.has(requestedWindow)) {
    return NextResponse.json(
      { detail: `Unsupported window '${requestedWindow}'. Allowed values: 24h, 7d, 30d.` },
      { status: 400 }
    );
  }

  const suffix = `?window=${encodeURIComponent(requestedWindow)}`;
  return proxyAuthenticatedJson({
    request,
    path: `/api/dashboard/summary${suffix}`,
    method: "GET",
    timeoutMs: DASHBOARD_SUMMARY_TIMEOUT_MS
  });
}
