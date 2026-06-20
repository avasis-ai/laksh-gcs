import type { PricingResponse, TokenResponse } from "./types";

/**
 * Stable JWT resolver for the Reactor SDK provider.
 *
 * The SDK calls this whenever it needs a fresh token (initial connect and
 * silent re-auth). It hits our server route, which mints the JWT from the
 * secret API key. Always returns a *string* as the SDK expects.
 */
export async function fetchJwt(): Promise<string> {
  const res = await fetch("/api/reactor/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Token request failed (${res.status})`);
  }
  const data = (await res.json()) as TokenResponse;
  return data.jwt;
}

/** Fetch the public pricing table via our proxy route. */
export async function fetchPricing(): Promise<PricingResponse> {
  const res = await fetch("/api/reactor/pricing");
  if (!res.ok) throw new Error(`Pricing request failed (${res.status})`);
  return (await res.json()) as PricingResponse;
}

export interface HealthResponse {
  ok: boolean;
  configured: boolean;
  apiUrl: string;
  tokenExpiresAt?: number;
  error?: string;
}

/** Check whether the backend is configured and credentials are valid. */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/reactor/health");
  return (await res.json()) as HealthResponse;
}
