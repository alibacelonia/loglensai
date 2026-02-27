import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl, parseResponseBody, setAuthCookies } from "@/lib/server-auth";

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
  const email = readStringField(inputBody, "email").toLowerCase();
  const password = readStringField(inputBody, "password");
  const passwordConfirm = readStringField(inputBody, "password_confirm");

  if (!username || !email || !password || !passwordConfirm) {
    return NextResponse.json(
      { detail: "Username, email, password, and password confirmation are required." },
      { status: 400 }
    );
  }

  try {
    const backendResponse = await fetch(`${getBackendUrl()}/api/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        username,
        email,
        password,
        password_confirm: passwordConfirm
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_PROXY_TIMEOUT_MS)
    });

    const rawBody = await backendResponse.text();
    const parsedBody = parseResponseBody(rawBody);

    if (!backendResponse.ok) {
      return NextResponse.json(parsedBody, { status: backendResponse.status });
    }

    const responseBody = parsedBody as {
      access?: unknown;
      refresh?: unknown;
      user?: unknown;
    };

    if (typeof responseBody.access !== "string" || typeof responseBody.refresh !== "string") {
      return NextResponse.json({ detail: "Invalid auth response from backend." }, { status: 502 });
    }

    const response = NextResponse.json({ user: responseBody.user ?? null }, { status: 201 });
    setAuthCookies(response, {
      accessToken: responseBody.access,
      refreshToken: responseBody.refresh
    });
    return response;
  } catch {
    return NextResponse.json({ detail: "Registration request failed." }, { status: 502 });
  }
}
