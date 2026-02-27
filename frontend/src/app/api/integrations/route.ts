import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/integrations",
    method: "GET"
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.text();
  return proxyAuthenticatedJson({
    request,
    path: "/api/integrations",
    method: "PUT",
    headers: { "content-type": "application/json" },
    body
  });
}
