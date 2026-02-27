import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const ANALYSIS_PROXY_TIMEOUT_MS = 15_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await context.params;
  if (!/^\d+$/.test(analysisId)) {
    return NextResponse.json({ detail: "Invalid analysis id." }, { status: 400 });
  }

  return proxyAuthenticatedJson({
    request,
    path: `/api/analyses/${analysisId}/clusters`,
    method: "GET",
    timeoutMs: ANALYSIS_PROXY_TIMEOUT_MS
  });
}
