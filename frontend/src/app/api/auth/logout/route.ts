import { NextResponse } from "next/server";

import { clearAuthCookies } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ detail: "Logged out." }, { status: 200 });
  clearAuthCookies(response);
  return response;
}
