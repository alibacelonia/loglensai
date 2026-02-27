import { NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

const SOURCE_PROXY_TIMEOUT_MS = 15_000;

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/sources",
    method: "GET",
    timeoutMs: SOURCE_PROXY_TIMEOUT_MS
  });
}

export async function POST(request: NextRequest) {
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

  return proxyAuthenticatedJson({
    request,
    path: "/api/sources",
    method: "POST",
    body: backendFormData,
    timeoutMs: SOURCE_PROXY_TIMEOUT_MS
  });
}
