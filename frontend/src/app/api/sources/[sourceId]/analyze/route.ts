import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const SOURCE_ANALYZE_TIMEOUT_MS = 15_000;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await context.params;
  if (!/^\d+$/.test(sourceId)) {
    return NextResponse.json({ detail: "Invalid source id." }, { status: 400 });
  }

  return proxyAuthenticatedJson({
    request,
    path: `/api/sources/${sourceId}/analyze`,
    method: "POST",
    timeoutMs: SOURCE_ANALYZE_TIMEOUT_MS
  });
}
