import { NextResponse } from "next/server";

import { getApiUrl, mintToken } from "@/lib/reactor/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/reactor/health
 * Lightweight readiness probe: confirms the API key is configured and can
 * mint a token against the live coordinator. Used by the dashboard to show
 * a configured/unconfigured banner without exposing the key.
 */
export async function GET() {
  const configured = Boolean(process.env.REACTOR_API_KEY);
  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        apiUrl: getApiUrl(),
        error: "REACTOR_API_KEY is not set.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // Mint a 60s token purely to validate credentials, then discard it.
    const token = await mintToken(60);
    return NextResponse.json(
      {
        ok: true,
        configured: true,
        apiUrl: getApiUrl(),
        tokenExpiresAt: token.expires_at,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, configured: true, apiUrl: getApiUrl(), error: message },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
