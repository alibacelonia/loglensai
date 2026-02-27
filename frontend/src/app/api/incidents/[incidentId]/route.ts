import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const INCIDENT_DETAIL_TIMEOUT_MS = 20_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> }
) {
  const { incidentId } = await context.params;
  if (!/^\d+$/.test(incidentId)) {
    return NextResponse.json({ detail: "Invalid incident id." }, { status: 400 });
  }

  return proxyAuthenticatedJson({
    request,
    path: `/api/incidents/${incidentId}`,
    method: "GET",
    timeoutMs: INCIDENT_DETAIL_TIMEOUT_MS
  });
}
