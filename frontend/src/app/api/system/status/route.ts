import { NextResponse } from "next/server";

import { getBackendUrl, parseResponseBody } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const environment = (process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "dev").toLowerCase();

  try {
    const response = await fetch(`${getBackendUrl()}/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    const rawBody = await response.text();
    const parsed = parseResponseBody(rawBody) as {
      checks?: { redis?: string };
    };

    const queueHealth = response.ok && parsed?.checks?.redis === "ok" ? "ok" : "degraded";
    return NextResponse.json(
      {
        environment,
        queue_health: queueHealth
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        environment,
        queue_health: "degraded"
      },
      { status: 200 }
    );
  }
}
