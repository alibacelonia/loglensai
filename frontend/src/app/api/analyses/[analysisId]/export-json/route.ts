import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_BACKEND_URL = "http://backend:8000";
const ANALYSIS_PROXY_TIMEOUT_MS = 20_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ analysisId: string }> }
) {
  const accessToken = request.headers.get("x-access-token")?.trim();
  if (!accessToken) {
    return NextResponse.json({ detail: "Access token is required." }, { status: 401 });
  }

  const { analysisId } = await context.params;
  if (!/^\d+$/.test(analysisId)) {
    return NextResponse.json({ detail: "Invalid analysis id." }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL || DEFAULT_BACKEND_URL;
  try {
    const response = await fetch(`${backendUrl}/api/analyses/${analysisId}/export.json`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(ANALYSIS_PROXY_TIMEOUT_MS)
    });

    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "application/json";
    const contentDisposition = response.headers.get("content-disposition");
    const headers: Record<string, string> = {
      "content-type": contentType
    };
    if (contentDisposition) {
      headers["content-disposition"] = contentDisposition;
    }
    return new NextResponse(body, {
      status: response.status,
      headers
    });
  } catch {
    return NextResponse.json({ detail: "JSON export request failed." }, { status: 502 });
  }
}
