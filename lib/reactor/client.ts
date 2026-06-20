import type { PricingResponse, TokenResponse } from "./types";
import { invokeCommand, isTauri } from "./runtime";

/**
 * Client-side JWT cache.
 *
 * Measured (scripts/stress): minting a token via POST /tokens costs ~680 ms p50
 * (p95 ~730 ms). The SDK's JwtResolver is invoked before *every* authenticated
 * Coordinator hop (POST /sessions, POST .../connections, silent re-auth …), so a
 * naive mint-per-call added hundreds of ms to each connect. Reactor JWTs are
 * valid for up to 6 h, so we cache the minted token in-memory and reuse it until
 * a small skew before expiry. Concurrent callers share a single in-flight mint.
 *
 * The secret API key still never leaves the server/Rust process — only the
 * short-lived JWT is cached, in the browser tab's memory, for this session.
 */
let tokenCache: { jwt: string; expiresAtMs: number } | null = null;
let inFlight: Promise<TokenResponse> | null = null;

/** Refresh this many ms before the JWT actually expires (clock-skew guard). */
const REFRESH_SKEW_MS = 5 * 60_000;

async function mint(): Promise<TokenResponse> {
  if (isTauri()) {
    return invokeCommand<TokenResponse>("mint_reactor_token", {});
  }
  const res = await fetch("/api/reactor/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Token request failed (${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Stable JWT resolver for the Reactor SDK provider.
 *
 * Returns a cached token while it is comfortably valid; otherwise mints a new
 * one (de-duplicating concurrent requests). Always returns a *string*.
 */
export async function fetchJwt(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - REFRESH_SKEW_MS > now) {
    return tokenCache.jwt;
  }
  if (!inFlight) {
    inFlight = mint().finally(() => {
      inFlight = null;
    });
  }
  try {
    const data = await inFlight;
    // expires_at is unix seconds; fall back to a conservative 30-min TTL if absent.
    const expiresAtMs = data.expires_at ? data.expires_at * 1000 : now + 30 * 60_000;
    tokenCache = { jwt: data.jwt, expiresAtMs };
    return data.jwt;
  } catch (err) {
    tokenCache = null;
    throw err;
  }
}

/** Drop the cached token (e.g. on a 401) so the next call re-mints. */
export function clearJwtCache(): void {
  tokenCache = null;
}

/** Fetch the public pricing table (Rust command on desktop, proxy route on web). */
export async function fetchPricing(): Promise<PricingResponse> {
  if (isTauri()) {
    return invokeCommand<PricingResponse>("reactor_pricing");
  }

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
  if (isTauri()) {
    return invokeCommand<HealthResponse>("reactor_health");
  }

  const res = await fetch("/api/reactor/health");
  return (await res.json()) as HealthResponse;
}
