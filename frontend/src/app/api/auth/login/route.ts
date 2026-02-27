import { NextRequest, NextResponse } from "next/server";

import { clearAuthCookies, getBackendUrl, parseResponseBody, setAuthCookies } from "@/lib/server-auth";

export const runtime = "nodejs";

const AUTH_PROXY_TIMEOUT_MS = 15_000;

function readStringField(input: unknown, field: string) {
  if (!input || typeof input !== "object") {
    return "";
  }

  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  let inputBody: unknown;
  try {
    inputBody = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON payload." }, { status: 400 });
  }

  const username = readStringField(inputBody, "username");
  const password = readStringField(inputBody, "password");

  if (!username || !password) {
    return NextResponse.json({ detail: "Username and password are required." }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(`${getBackendUrl()}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_PROXY_TIMEOUT_MS)
    });

    const rawBody = await backendResponse.text();
    const parsedBody = parseResponseBody(rawBody);

    if (!backendResponse.ok) {
      const response = NextResponse.json(parsedBody, { status: backendResponse.status });
      if (backendResponse.status === 401) {
        clearAuthCookies(response);
      }
      return response;
    }

    const responseBody = parsedBody as {
      access?: unknown;
      refresh?: unknown;
      user?: unknown;
    };

    if (typeof responseBody.access !== "string" || typeof responseBody.refresh !== "string") {
      return NextResponse.json({ detail: "Invalid auth response from backend." }, { status: 502 });
    }

    const response = NextResponse.json({ user: responseBody.user ?? null }, { status: 200 });
    setAuthCookies(response, {
      accessToken: responseBody.access,
      refreshToken: responseBody.refresh
    });
    return response;
  } catch {
    return NextResponse.json({ detail: "Login request failed." }, { status: 502 });
  }
}
