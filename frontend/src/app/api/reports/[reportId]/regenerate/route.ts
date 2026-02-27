import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const REPORTS_REGENERATE_TIMEOUT_MS = 20_000;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await context.params;
  if (!/^\d+$/.test(reportId)) {
    return NextResponse.json({ detail: "Invalid report id." }, { status: 400 });
  }
  return proxyAuthenticatedJson({
    request,
    path: `/api/reports/${reportId}/regenerate`,
    method: "POST",
    timeoutMs: REPORTS_REGENERATE_TIMEOUT_MS
  });
}
