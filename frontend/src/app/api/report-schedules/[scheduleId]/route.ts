import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const REPORT_SCHEDULE_TIMEOUT_MS = 20_000;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await context.params;
  if (!/^\d+$/.test(scheduleId)) {
    return NextResponse.json({ detail: "Invalid schedule id." }, { status: 400 });
  }
  const payload = await request.json().catch(() => ({}));
  return proxyAuthenticatedJson({
    request,
    path: `/api/report-schedules/${scheduleId}`,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: REPORT_SCHEDULE_TIMEOUT_MS
  });
}
