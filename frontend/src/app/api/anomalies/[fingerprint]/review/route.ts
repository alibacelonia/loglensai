import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const ANOMALY_REVIEW_TIMEOUT_MS = 20_000;

function isFingerprintValid(fingerprint: string) {
  return /^[a-f0-9]{32,64}$/.test(fingerprint);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ fingerprint: string }> }
) {
  const { fingerprint } = await context.params;
  if (!isFingerprintValid(fingerprint)) {
    return NextResponse.json({ detail: "Invalid anomaly fingerprint." }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as { service?: unknown; status?: unknown };
  const service = typeof payload.service === "string" ? payload.service : "";
  const status = typeof payload.status === "string" ? payload.status : "reviewed";

  return proxyAuthenticatedJson({
    request,
    path: `/api/anomalies/${fingerprint}/review`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ service, status }),
    timeoutMs: ANOMALY_REVIEW_TIMEOUT_MS
  });
}
