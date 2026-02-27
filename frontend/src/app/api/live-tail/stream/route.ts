import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedStream } from "@/lib/server-auth";

export const runtime = "nodejs";

const LIVE_TAIL_STREAM_TIMEOUT_MS = 70_000;
const MAX_QUERY_LENGTH = 200;

export async function GET(request: NextRequest) {
  const level = (request.nextUrl.searchParams.get("level") || "").trim().toLowerCase();
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  const analysisId = (request.nextUrl.searchParams.get("analysis_id") || "").trim();

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { detail: `Search query exceeds ${MAX_QUERY_LENGTH} characters.` },
      { status: 400 }
    );
  }

  if (analysisId && !/^\d+$/.test(analysisId)) {
    return NextResponse.json({ detail: "analysis_id must be numeric." }, { status: 400 });
  }

  const params = new URLSearchParams();
  if (level) {
    params.set("level", level);
  }
  if (query) {
    params.set("q", query);
  }
  if (analysisId) {
    params.set("analysis_id", analysisId);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return proxyAuthenticatedStream(
    {
      request,
      path: `/api/live-tail/stream${suffix}`,
      method: "GET",
      timeoutMs: LIVE_TAIL_STREAM_TIMEOUT_MS
    },
    "text/event-stream"
  );
}
