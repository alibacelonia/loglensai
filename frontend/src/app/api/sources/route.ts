import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_BACKEND_URL = "http://backend:8000";
const SOURCE_PROXY_TIMEOUT_MS = 15_000;

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

export async function POST(request: NextRequest) {
  const accessToken = request.headers.get("x-access-token")?.trim();
  if (!accessToken) {
    return NextResponse.json({ detail: "Access token is required." }, { status: 401 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "File is required." }, { status: 400 });
  }

  const backendFormData = new FormData();
  const name = incoming.get("name");
  if (typeof name === "string" && name.trim()) {
    backendFormData.set("name", name.trim());
  }
  backendFormData.set("file", file, file.name || "source.log");

  const backendUrl = process.env.BACKEND_INTERNAL_URL || DEFAULT_BACKEND_URL;

  try {
    const response = await fetch(`${backendUrl}/api/sources`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: backendFormData,
      cache: "no-store",
      signal: AbortSignal.timeout(SOURCE_PROXY_TIMEOUT_MS)
    });
    const rawBody = await response.text();
    return NextResponse.json(parseResponseBody(rawBody), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Source upload request failed." }, { status: 502 });
  }
}
