import "server-only";

import type { PricingResponse, TokenResponse } from "./types";

const DEFAULT_API_URL = "https://api.reactor.inc";

/** Resolve the Reactor API base URL (no trailing slash). */
export function getApiUrl(): string {
  return (process.env.REACTOR_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

/** Read the server-side API key, throwing a clear error if missing. */
export function getApiKey(): string {
  const key = process.env.REACTOR_API_KEY;
  if (!key) {
    throw new ReactorConfigError(
      "REACTOR_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  return key;
}

export class ReactorConfigError extends Error {
  code = "CONFIG_ERROR" as const;
}

export class ReactorApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, status: number, code = "REACTOR_API_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Mint a short-lived JWT from the long-lived API key.
 * The key never leaves the server; the browser only ever sees the JWT.
 *
 * @param expiresAfter Optional TTL in seconds. Values >= 21600 (6h) are
 *   silently clamped by Reactor. Omit for the default 6h token.
 */
export async function mintToken(expiresAfter?: number): Promise<TokenResponse> {
  const apiKey = getApiKey();

  const res = await fetch(`${getApiUrl()}/tokens`, {
    method: "POST",
    headers: {
      "Reactor-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: expiresAfter ? JSON.stringify({ expires_after: expiresAfter }) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await safeReadText(res);
    throw new ReactorApiError(
      `Failed to mint token (${res.status}): ${detail}`,
      res.status,
      res.status === 401 ? "AUTHENTICATION_FAILED" : "TOKEN_MINT_FAILED",
    );
  }

  return (await res.json()) as TokenResponse;
}

// Pricing changes rarely; cache it in-process to avoid hammering the API.
let pricingCache: { data: PricingResponse; at: number } | null = null;
const PRICING_TTL_MS = 60_000;

/** Fetch (and cache) the public pricing table. No auth required. */
export async function getPricing(force = false): Promise<PricingResponse> {
  const now = Date.now();
  if (!force && pricingCache && now - pricingCache.at < PRICING_TTL_MS) {
    return pricingCache.data;
  }

  const res = await fetch(`${getApiUrl()}/pricing`, { cache: "no-store" });
  if (!res.ok) {
    const detail = await safeReadText(res);
    throw new ReactorApiError(
      `Failed to fetch pricing (${res.status}): ${detail}`,
      res.status,
      "PRICING_FETCH_FAILED",
    );
  }

  const data = (await res.json()) as PricingResponse;
  pricingCache = { data, at: now };
  return data;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return res.statusText;
  }
}
