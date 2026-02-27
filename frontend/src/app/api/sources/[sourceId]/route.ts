import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const SOURCE_DETAIL_TIMEOUT_MS = 15_000;

function parseSourceId(raw: string) {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  return raw;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await context.params;
  const safeId = parseSourceId(sourceId);
  if (!safeId) {
    return NextResponse.json({ detail: "Invalid source id." }, { status: 400 });
  }

  return proxyAuthenticatedJson({
    request,
    path: `/api/sources/${safeId}`,
    method: "GET",
    timeoutMs: SOURCE_DETAIL_TIMEOUT_MS
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await context.params;
  const safeId = parseSourceId(sourceId);
  if (!safeId) {
    return NextResponse.json({ detail: "Invalid source id." }, { status: 400 });
  }

  return proxyAuthenticatedJson({
    request,
    path: `/api/sources/${safeId}`,
    method: "DELETE",
    timeoutMs: SOURCE_DETAIL_TIMEOUT_MS
  });
}
