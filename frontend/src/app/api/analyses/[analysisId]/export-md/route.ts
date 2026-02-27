import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedBinary } from "@/lib/server-auth";

export const runtime = "nodejs";

const ANALYSIS_PROXY_TIMEOUT_MS = 20_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await context.params;
  if (!/^\d+$/.test(analysisId)) {
    return NextResponse.json({ detail: "Invalid analysis id." }, { status: 400 });
  }

  return proxyAuthenticatedBinary(
    {
      request,
      path: `/api/analyses/${analysisId}/export.md`,
      method: "GET",
      timeoutMs: ANALYSIS_PROXY_TIMEOUT_MS
    },
    "text/markdown; charset=utf-8"
  );
}
