import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const CLUSTER_PROXY_TIMEOUT_MS = 15_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await context.params;
  if (!/^\d+$/.test(clusterId)) {
    return NextResponse.json({ detail: "Invalid cluster id." }, { status: 400 });
  }

  return proxyAuthenticatedJson({
    request,
    path: `/api/clusters/${clusterId}`,
    method: "GET",
    timeoutMs: CLUSTER_PROXY_TIMEOUT_MS
  });
}
