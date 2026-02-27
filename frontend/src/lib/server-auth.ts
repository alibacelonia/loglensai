import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://backend:8000";
const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60;
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_PROXY_TIMEOUT_MS = 15_000;

export const AUTH_ACCESS_COOKIE_NAME = "loglens_access";
export const AUTH_REFRESH_COOKIE_NAME = "loglens_refresh";

type AuthCookieTokens = {
  accessToken: string;
  refreshToken?: string;
};

type AuthenticatedBackendRequestOptions = {
  request: NextRequest;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
};

type AuthenticatedBackendRequestResult = {
  backendResponse: Response | null;
  refreshToken: string | null;
  renewedAccessToken: string | null;
  authMissing: boolean;
  clearSession: boolean;
};

function cookieSecurityOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/"
  };
}

function setAccessCookie(response: NextResponse, accessToken: string) {
  response.cookies.set(AUTH_ACCESS_COOKIE_NAME, accessToken, {
    ...cookieSecurityOptions(),
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS
  });
}

function setRefreshCookie(response: NextResponse, refreshToken: string) {
  response.cookies.set(AUTH_REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieSecurityOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS
  });
}

function extractDetail(payload: unknown): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  return "Authentication required. Please sign in.";
}

function applySessionMutation(response: NextResponse, mutation: { clearSession: boolean; renewedAccessToken: string | null }) {
  if (mutation.clearSession) {
    clearAuthCookies(response);
    return;
  }

  if (mutation.renewedAccessToken) {
    setAccessCookie(response, mutation.renewedAccessToken);
  }
}

export function getBackendUrl() {
  return process.env.BACKEND_INTERNAL_URL || DEFAULT_BACKEND_URL;
}

export function parseResponseBody(rawBody: string): unknown {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return { detail: rawBody };
  }
}

export function setAuthCookies(response: NextResponse, tokens: AuthCookieTokens) {
  setAccessCookie(response, tokens.accessToken);
  if (tokens.refreshToken) {
    setRefreshCookie(response, tokens.refreshToken);
  }
}

export function clearAuthCookies(response: NextResponse) {
  const options = {
    ...cookieSecurityOptions(),
    maxAge: 0
  };
  response.cookies.set(AUTH_ACCESS_COOKIE_NAME, "", options);
  response.cookies.set(AUTH_REFRESH_COOKIE_NAME, "", options);
}

async function refreshAccessToken(refreshToken: string, timeoutMs: number) {
  try {
    const response = await fetch(`${getBackendUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ refresh: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { access?: unknown };
    if (typeof body.access === "string" && body.access.trim()) {
      return body.access;
    }
  } catch {
    return null;
  }

  return null;
}

async function executeAuthenticatedBackendRequest(
  options: AuthenticatedBackendRequestOptions
): Promise<AuthenticatedBackendRequestResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROXY_TIMEOUT_MS;
  const refreshToken = options.request.cookies.get(AUTH_REFRESH_COOKIE_NAME)?.value ?? null;
  let accessToken = options.request.cookies.get(AUTH_ACCESS_COOKIE_NAME)?.value ?? null;
  let renewedAccessToken: string | null = null;

  if (!accessToken && refreshToken) {
    accessToken = await refreshAccessToken(refreshToken, timeoutMs);
    renewedAccessToken = accessToken;
  }

  if (!accessToken) {
    return {
      backendResponse: null,
      refreshToken,
      renewedAccessToken: null,
      authMissing: true,
      clearSession: Boolean(refreshToken)
    };
  }

  const executeFetch = async (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };

    return fetch(`${getBackendUrl()}${options.path}`, {
      method: options.method || "GET",
      headers,
      body: options.body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs)
    });
  };

  try {
    let backendResponse = await executeFetch(accessToken);

    if (backendResponse.status === 401 && refreshToken) {
      const refreshedToken = await refreshAccessToken(refreshToken, timeoutMs);
      if (refreshedToken) {
        renewedAccessToken = refreshedToken;
        backendResponse = await executeFetch(refreshedToken);
      }
    }

    const clearSession = backendResponse.status === 401;

    return {
      backendResponse,
      refreshToken,
      renewedAccessToken,
      authMissing: false,
      clearSession
    };
  } catch {
    return {
      backendResponse: null,
      refreshToken,
      renewedAccessToken,
      authMissing: false,
      clearSession: false
    };
  }
}

export async function proxyAuthenticatedJson(
  options: AuthenticatedBackendRequestOptions
): Promise<NextResponse> {
  const execution = await executeAuthenticatedBackendRequest(options);

  if (execution.authMissing) {
    const unauthorized = NextResponse.json(
      { detail: "Authentication required. Please sign in." },
      { status: 401 }
    );
    applySessionMutation(unauthorized, execution);
    return unauthorized;
  }

  if (!execution.backendResponse) {
    const failure = NextResponse.json({ detail: "Backend request failed." }, { status: 502 });
    applySessionMutation(failure, execution);
    return failure;
  }

  const rawBody = await execution.backendResponse.text();
  const parsedBody = parseResponseBody(rawBody);
  const status = execution.backendResponse.status;
  const payload = status === 401 ? { detail: extractDetail(parsedBody) } : parsedBody;

  const response = NextResponse.json(payload, { status });
  applySessionMutation(response, execution);
  return response;
}

export async function proxyAuthenticatedBinary(
  options: AuthenticatedBackendRequestOptions,
  fallbackContentType: string
): Promise<NextResponse> {
  const execution = await executeAuthenticatedBackendRequest(options);

  if (execution.authMissing) {
    const unauthorized = NextResponse.json(
      { detail: "Authentication required. Please sign in." },
      { status: 401 }
    );
    applySessionMutation(unauthorized, execution);
    return unauthorized;
  }

  if (!execution.backendResponse) {
    const failure = NextResponse.json({ detail: "Backend request failed." }, { status: 502 });
    applySessionMutation(failure, execution);
    return failure;
  }

  const status = execution.backendResponse.status;
  if (status >= 400) {
    const rawBody = await execution.backendResponse.text();
    const parsedBody = parseResponseBody(rawBody);
    const payload = status === 401 ? { detail: extractDetail(parsedBody) } : parsedBody;
    const errorResponse = NextResponse.json(payload, { status });
    applySessionMutation(errorResponse, execution);
    return errorResponse;
  }

  const body = await execution.backendResponse.arrayBuffer();
  const contentType = execution.backendResponse.headers.get("content-type") || fallbackContentType;
  const contentDisposition = execution.backendResponse.headers.get("content-disposition");

  const responseHeaders: Record<string, string> = {
    "content-type": contentType
  };
  if (contentDisposition) {
    responseHeaders["content-disposition"] = contentDisposition;
  }

  const response = new NextResponse(body, {
    status,
    headers: responseHeaders
  });
  applySessionMutation(response, execution);
  return response;
}
