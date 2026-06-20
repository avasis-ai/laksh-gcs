// Shared helpers for the Laksh stress-test harness (scratch tooling — NOT shipped
// in the app bundle; excluded from eslint/tsc via scripts/stress/ being outside
// the Next source tree). Loads .env.local and exposes the live Reactor base URL.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

export function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // ignore
  }
  return env;
}

const env = loadEnv();
export const API_KEY = env.REACTOR_API_KEY || process.env.REACTOR_API_KEY;
export const API_URL = (env.REACTOR_API_URL || "https://api.reactor.inc").replace(/\/+$/, "");

export function pct(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    min: s[0],
    max: s[s.length - 1],
    mean: sum / s.length,
    p50: pct(s, 50),
    p90: pct(s, 90),
    p95: pct(s, 95),
    p99: pct(s, 99),
  };
}

export function fmt(x) {
  return Number.isFinite(x) ? x.toFixed(1) : "—";
}

export async function mintTokenDirect(expiresAfter) {
  const t0 = performance.now();
  const res = await fetch(`${API_URL}/tokens`, {
    method: "POST",
    headers: { "Reactor-API-Key": API_KEY, "Content-Type": "application/json" },
    body: expiresAfter ? JSON.stringify({ expires_after: expiresAfter }) : undefined,
  });
  const ms = performance.now() - t0;
  const body = await res.text();
  return { ms, status: res.status, ok: res.ok, body };
}

export async function getPricingDirect() {
  const t0 = performance.now();
  const res = await fetch(`${API_URL}/pricing`);
  const ms = performance.now() - t0;
  const body = await res.json().catch(() => ({}));
  return { ms, status: res.status, ok: res.ok, body };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
