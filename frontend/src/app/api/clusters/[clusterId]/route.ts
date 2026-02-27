import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_BACKEND_URL = "http://backend:8000";
const CLUSTER_PROXY_TIMEOUT_MS = 15_000;

function parseResponseBody(rawBody: string) {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return { detail: rawBody };
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clusterId: string }> }
) {
  const accessToken = request.headers.get("x-access-token")?.trim();
  if (!accessToken) {
    return NextResponse.json({ detail: "Access token is required." }, { status: 401 });
  }

  const { clusterId } = await context.params;
  if (!/^\d+$/.test(clusterId)) {
    return NextResponse.json({ detail: "Invalid cluster id." }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL || DEFAULT_BACKEND_URL;
  try {
    const response = await fetch(`${backendUrl}/api/clusters/${clusterId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(CLUSTER_PROXY_TIMEOUT_MS)
    });
    const rawBody = await response.text();
    return NextResponse.json(parseResponseBody(rawBody), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Cluster detail request failed." }, { status: 502 });
  }
}
