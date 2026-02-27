import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyAuthenticatedJson({
    request,
    path: "/api/auth/change-password",
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}
