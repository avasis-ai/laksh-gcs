import { NextResponse } from "next/server";

import { ReactorApiError, getPricing } from "@/lib/reactor/server";

export const runtime = "nodejs";
// Revalidate at most once a minute; the server lib also caches in-process.
export const revalidate = 60;

/**
 * GET /api/reactor/pricing
 * Proxies the public Reactor pricing table so the dashboard can render
 * per-model credit rates and estimated session cost.
 */
export async function GET() {
  try {
    const pricing = await getPricing();
    return NextResponse.json(pricing, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (err) {
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
}
