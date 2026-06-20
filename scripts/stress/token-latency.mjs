// Token-infra latency harness (FREE — no GPU, no billing).
// Measures POST /tokens latency distribution (sequential + concurrent bursts),
// confirms pricing payload, and probes pricing/health caching behaviour.
import { API_URL, API_KEY, mintTokenDirect, getPricingDirect, stats, fmt, sleep } from "./lib.mjs";

if (!API_KEY) {
  console.error("No REACTOR_API_KEY found in .env.local");
  process.exit(1);
}

console.log(`# Token infra latency — ${API_URL}`);
console.log(`# key prefix: ${API_KEY.slice(0, 6)}… (redacted)\n`);

// ---- 1. Sequential /tokens ----
const SEQ = 30;
const seqMs = [];
let firstExpiry = null;
for (let i = 0; i < SEQ; i++) {
  const r = await mintTokenDirect();
  if (!r.ok) {
    console.error(`  seq ${i}: HTTP ${r.status} ${r.body.slice(0, 120)}`);
    if (r.status === 402) { console.error("OUT OF CREDITS (402) — aborting"); process.exit(2); }
  } else {
    seqMs.push(r.ms);
    if (i === 0) { try { firstExpiry = JSON.parse(r.body).expires_at; } catch {} }
  }
  await sleep(50);
}
const seq = stats(seqMs);
console.log(`## POST /tokens — ${SEQ} sequential`);
console.log(`  n=${seq.n} min=${fmt(seq.min)} p50=${fmt(seq.p50)} p90=${fmt(seq.p90)} p95=${fmt(seq.p95)} p99=${fmt(seq.p99)} max=${fmt(seq.max)} mean=${fmt(seq.mean)} ms`);
if (firstExpiry) console.log(`  default token expires_at=${firstExpiry} (TTL ~${Math.round((firstExpiry * 1000 - Date.now()) / 3600000)}h)`);

// ---- 2. Concurrent bursts (small, to not trip 50/min) ----
for (const burst of [5, 10]) {
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: burst }, () => mintTokenDirect()));
  const wall = performance.now() - t0;
  const ok = results.filter((r) => r.ok);
  const bs = stats(ok.map((r) => r.ms));
  const codes = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log(`## POST /tokens — burst of ${burst} concurrent`);
  console.log(`  wall=${fmt(wall)}ms perReq p50=${fmt(bs.p50)} p95=${fmt(bs.p95)} max=${fmt(bs.max)} ms  codes=${JSON.stringify(codes)}`);
  await sleep(1500);
}

// ---- 3. expires_after=60 (health-style) ----
const shortMs = [];
for (let i = 0; i < 10; i++) { const r = await mintTokenDirect(60); if (r.ok) shortMs.push(r.ms); await sleep(50); }
const sh = stats(shortMs);
console.log(`## POST /tokens expires_after=60 — 10 sequential`);
console.log(`  p50=${fmt(sh.p50)} p95=${fmt(sh.p95)} max=${fmt(sh.max)} ms`);

// ---- 4. Pricing payload + caching probe ----
const pr = await getPricingDirect();
console.log(`\n## GET /pricing (direct, no auth)`);
console.log(`  status=${pr.status} latency=${fmt(pr.ms)}ms`);
console.log(`  models: ${JSON.stringify(pr.body.models)}`);
console.log(`  settings: ${JSON.stringify(pr.body.settings)}`);
const lingbot = (pr.body.models || []).find((m) => m.name === "lingbot");
if (lingbot) console.log(`  >> lingbot rate = ${JSON.stringify(lingbot.rate)}`);

// pricing direct latency distribution (server caches in-process; direct upstream is uncached)
const pms = [];
for (let i = 0; i < 10; i++) { const r = await getPricingDirect(); if (r.ok) pms.push(r.ms); await sleep(50); }
const ps = stats(pms);
console.log(`  upstream /pricing 10x: p50=${fmt(ps.p50)} p95=${fmt(ps.p95)} max=${fmt(ps.max)} ms (our server caches this for 60s)`);

console.log("\n# done (no GPU billed)");
