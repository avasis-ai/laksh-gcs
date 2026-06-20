import { NextResponse } from "next/server";

import {
  ReactorApiError,
  ReactorConfigError,
  mintToken,
} from "@/lib/reactor/server";

// Always run on-demand; never cache a short-lived secret token.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TokenRequestBody {
  /** Optional TTL in seconds (clamped server-side to 6h max). */
  expiresAfter?: number;
}

/**
 * POST /api/reactor/token
 * Exchanges the server-held REACTOR_API_KEY for a short-lived JWT that the
 * browser SDK uses to connect. The raw API key is never sent to the client.
 */
export async function POST(request: Request) {
  let body: TokenRequestBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Ignore malformed body — treat as no options.
  }

  try {
    const token = await mintToken(body.expiresAfter);
    return NextResponse.json(token, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof ReactorConfigError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: 500 },
    );
  }
  if (err instanceof ReactorApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json(
    { error: message, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
