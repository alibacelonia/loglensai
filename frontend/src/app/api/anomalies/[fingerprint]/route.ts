import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const ANOMALY_DETAIL_TIMEOUT_MS = 20_000;

function isFingerprintValid(fingerprint: string) {
  return /^[a-f0-9]{32,64}$/.test(fingerprint);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fingerprint: string }> }
) {
  const { fingerprint } = await context.params;
  if (!isFingerprintValid(fingerprint)) {
    return NextResponse.json({ detail: "Invalid anomaly fingerprint." }, { status: 400 });
  }

  const service = (request.nextUrl.searchParams.get("service") || "").trim();
  if (service.length > 128) {
    return NextResponse.json({ detail: "service exceeds 128 characters." }, { status: 400 });
  }

  const suffix = service ? `?service=${encodeURIComponent(service)}` : "";
  return proxyAuthenticatedJson({
    request,
    path: `/api/anomalies/${fingerprint}${suffix}`,
    method: "GET",
    timeoutMs: ANOMALY_DETAIL_TIMEOUT_MS
  });
}
