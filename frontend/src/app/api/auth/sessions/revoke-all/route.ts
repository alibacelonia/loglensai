import { NextRequest } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyAuthenticatedJson({
    request,
    path: "/api/auth/sessions/revoke-all",
    method: "POST"
  });
}
