import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/auth/sessions",
    method: "GET"
  });
}
