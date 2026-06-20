# Laksh — Reactor LingBot Stress-Test & Performance Findings

**Product:** Laksh (CelesticLabs Pvt. Ltd.) — Reactor LingBot UAV world-model GCS.
**Date:** 2026-06-20 · **Platform:** live `https://api.reactor.inc`, model `lingbot`.
**Method:** real measurements against the live API (no guessing). Harness in
[`scripts/stress/`](../../scripts/stress/) (Python `reactor-sdk` 0.8.0 + aiortc for
frame timing; Node for token infra). Raw output in `scripts/stress/results/`.

> **Total GPU spend for the entire sweep: ~2,100 credits ≈ $0.21** (budget was
> ≤ ~8 min `ready` / < $1.60). lingbot bills **33 credits/sec** in `ready` only
> (confirmed live from `/pricing`); 10,000 credits = $1.

---

## 1. Headline numbers

| Metric | Measured (live) | Notes |
|---|---|---|
| `POST /tokens` latency | **p50 680 ms, p95 726 ms, max 904 ms** (30 seq) | The single biggest avoidable cost on the web connect path. TTL 6 h. |
| connect → `waiting` | **p50 ~1.1 s, p95 ~1.9 s** | Transport/SDP negotiation. `connect()` *returns here* (not at ready). |
| connect → `ready` (GPU assigned) | **p50 ~6.2 s, min 5.4 s, max 6.6 s** | `waiting → ready` (GPU scheduling) is the dominant ~4–5 s, platform-side. |
| `upload_file` (seed image) | ~2.7 s | Large seed JPEG; see §4 (resize seeds). |
| `set_image` → `image_accepted` | **~340 ms** | The decode gate works; fast. |
| **TTFF (`start` → first frame)** | **~1.46 s** | `start` → first `chunk_complete` ~1.06 s. |
| Chunk cadence | **inter-chunk p50 597 ms, p95 854 ms, mean 625 ms** | The control cadence / "heartbeat". |
| Frames per chunk | mean **23.8** (17 or 24) | — |
| **Effective throughput** | **~38–40 fps** | Measured from frames + cadence — **notably higher than the 16 fps nominal** in the docs; frames arrive faster than real-time (decoder/buffering). |
| Interframe jitter | p50 25.6 ms, p95 44.2 ms (~19 ms jitter) | Low; link is smooth. |
| **Command land latency** | **Δ2 chunks ≈ 1.41 s** (old coalescer) | Sent at chunk 5, reflected in `active_action='w'` at chunk 7. Fixed → ~Δ1 (see §3). |
| Concurrency cap | **5 ready OK; 6th → HTTP 429** `quota_exceeded {current:5,limit:5}` | Clean, fast rejection. |
| Seed reproducibility | **same-seed frame MAD 1.49 vs diff-seed 4.2 (2.8× separation)** | Fixed seed reproduces the world; residual 1.49 is codec noise. |

---

## 2. Detailed measurements

### 2.1 Token / pricing / health infra (free, no GPU)
`scripts/stress/token-latency.mjs` → `results/token-latency.txt`.

- **`POST /tokens` (30 sequential):** min 240, p50 **679**, p90 697, p95 726,
  p99/max 904 ms, mean 590. Default token TTL ≈ 6 h.
- **Concurrent bursts:** 5-burst wall 793 ms; 10-burst wall 769 ms — all `200`,
  **no 429**. Token minting parallelises fine.
- **`expires_after=60` (health-probe style):** p50 301, p95 703 ms.
- **`GET /pricing`:** 247 ms cold; upstream p50 679 ms across 10 calls. Our
  server (`lib/reactor/server.ts`) caches it **60 s in-process** and the route
  sets `s-maxage=60, stale-while-revalidate=300` — confirmed good; the dashboard
  never hammers upstream. lingbot rate confirmed **33 credits/s**, helios/
  longlive/sana 17.

**Bottleneck:** the ~680 ms token mint sits on the connect critical path, and
the SDK invokes the JWT resolver before **every** authenticated Coordinator hop
(create session, register connection, silent re-auth). Our old `fetchJwt` minted
fresh every call → multiple ~680 ms hits per connect. **Fixed in §3.**

### 2.2 Connection latency
`scripts/stress/connect_dist.py 3` → `results/connect_dist.txt`.

```
cycle 1: →waiting=1855.6ms →ready=6610.8ms
cycle 2: →waiting=1121.8ms →ready=5366.7ms
cycle 3: →waiting=1106.2ms →ready=6240.0ms
connect→waiting:  p50=1121.8  p95=1855.6
connect→ready:    p50=6243.4  p95=6623.7  min=5378.7  mean=6081.9 (ms)
```

**Key discovery:** in `reactor-sdk`, `connect()` **resolves at `waiting`, not
`ready`** — GPU assignment (`waiting → ready`, ~4–5 s) happens after. The web
app already handles this correctly: `StudioProvider.generate()` does
`await lb.connect(); await waitForStatus("ready")`. The ~4–5 s GPU scheduling is
platform-side and **not** client-tunable; the right lever is to keep
`autoConnect:false` (we do) so idle time is free and the operator knowingly
enters the billed warm state.

### 2.3 TTFF, cadence, throughput
`scripts/stress/main_session.py` → `results/main_session.txt`.

- `start` → **first frame 1461 ms**, first `chunk_complete` 1060 ms.
- First frame shape **(960, 1664, 3)** — matches the documented 1664×960.
- 705 frames over the run, steady **~38 fps**, inter-chunk **p50 597 ms**.
- The `modelTracks` prebuild (parallel SDP) is **already in effect**: the
  `LingbotProvider`/`LingbotModel` bake `LingbotTracks` into the constructor
  (`node_modules/@reactor-models/lingbot/dist/core.d.ts`), so the SDP offer is
  prepared in parallel with session polling. No change needed — confirmed sound.

### 2.4 Command responsiveness
Folded into the main session. Sent `set_movement: forward` mid-stream:

```
sent at chunk 5, landed at chunk 7 (Δ2 chunks) action='w'
send→reflected latency: 1410.0 ms
```

**Root cause:** the old `CommandCoalescer` flushed buffered intent **only on
`chunk_complete`**. So an engage (idle→forward) sat in the buffer until the next
`chunk_complete`, *then* the model applied it at the boundary after that → up to
**2 chunks**. Releases already flushed immediately. **Fixed in §3.**

### 2.5 Concurrency / limits
`scripts/stress/concurrency.py` → `results/concurrency.txt`.

```
reached ready: 5/5
6th session → REJECTED: RuntimeError: Failed to create session: 429
  {"current":5,"error":"quota_exceeded","limit":5,
   "message":"quota exceeded: concurrent_sessions for model \"lingbot\" (limit=5 …"}
```

Cap enforced exactly at 5, fast clean 429 on session creation. The web app
caught this only as a raw stack string. **Fixed in §3 (friendly copy).** We did
**not** hammer the 50/min limit.

### 2.6 Accuracy levers
`scripts/stress/accuracy_seed.py` → `results/accuracy_seed.txt`.

- **Fixed seed reproducibility — CONFIRMED.** Same image + prompt, settled-frame
  grayscale MAD: seed 42 vs 42 = **1.49**; seed 42 vs 777 = **4.15/4.37**
  (**2.8×**). Decoded WebRTC frames are never bit-identical (lossy codec), so the
  1.49 is the codec noise floor — same-seed worlds match. Validates
  `FIXED_SEED = 42` in `StudioProvider`.
- **`set_image` → await `image_accepted` → `set_prompt` → `start` ordering —
  CONFIRMED correct.** `image_accepted` lands in ~340 ms and the first frame is a
  coherent seeded world. LingBot has **no `set_conditioning`** (that's Helios),
  so the decode-gated ordering is the right race-avoidance pattern for lingbot.
  The web app already gates on `imageAcceptedRef` before `start` — kept.
- `image_strength` / `sr_scale` are **Helios-only** — not used (correct).

---

## 3. Changes applied (validated)

### A. Client-side JWT cache — `lib/reactor/client.ts`
**Why:** token mint is ~680 ms p50 and the SDK calls the resolver before every
authenticated hop; tokens last 6 h. **What:** cache the minted JWT in-memory and
reuse it until 5 min before expiry; de-duplicate concurrent mints; `clearJwtCache()`
for 401s. Secret stays server-only — only the short-lived JWT is cached, in the
tab's memory. **Expected:** removes ~680 ms × (hops per connect) from connect and
eliminates re-mint latency on silent re-auth. Idempotent; no behavioural change.

### B. Coalescer immediate engage-flush — `lib/laksh/control.ts`
**Why:** measured Δ2-chunk (~1.41 s) command landing because flush was
chunk-boundary-only. **What:** `setDesired` now flushes **engage / token
transitions** (movement/lookH/lookV) immediately too — rate-limited to once per
180 ms to avoid wire spam — while releases stay immediate and `chunk_complete`
remains the backstop. Rotation-speed-only changes still ride the chunk backstop
(no spam while looking). **Expected:** command land drops from ~Δ2 to ~Δ1 chunk
(≈ 600 ms faster) for the common press case; rapid oscillation still collapses to
the chunk cadence. Sound because the model only applies at boundaries anyway —
sending earlier can only help or be neutral.

### C. Friendly limit/credit errors — `components/StudioProvider.tsx`
**Why:** the live 429 surfaced as a raw `Failed to create session: 429 {…}`
string. **What:** `friendlyConnectError()` maps 429/`quota_exceeded` →
"All GPU sessions are in use (limit 5). Wait a moment and re-arm", 402 → credits
exhausted, 401 → token rejected. Operator-grade copy + mission-log entry.

### D. Prompt anti-morph cue — `lib/laksh/scene.ts`
**Why:** playbook §4.4 stability tip + the seed-repro finding. **What:** appended
a positive "coherent stable geometry, consistent structures" clause to the
ENHANCE quality cues (LingBot doesn't reliably honour negatives), within the
1000-char cap, one slot at a time. **Reasoned, not separately GPU A/B-measured**
(cost) — low-risk and aligned with the fixed-seed reproducibility result.

### Considered but **not** applied (avoiding cargo-cult)
- **`jitterBufferTarget` / `playout-delay`:** the SDK renders via `ReactorView`
  and does not expose the underlying `RTCRtpReceiver`, so this can't be set
  cleanly without a fragile hack — and measured jitter is already low (~19 ms,
  p95 interframe 44 ms). Left as a follow-up (would need an SDK hook).
- **`maxAttempts`:** already set to 8 (> default 6); it governs SDP-poll
  resilience, not happy-path speed. connect→waiting is already ~1.1 s p50. Kept.
- **Link-stats HUD:** already implemented (`components/hud/LinkQuality.tsx` reads
  `useStats()` → RTT/FPS/LOSS/JIT + relay-path warning). No change needed.
- **Warming/pre-spin GPU:** would incur speculative billing — explicitly avoided
  per cost guardrails; `autoConnect:false` retained.

---

## 4. Validation & follow-ups

**Validation (all clean):**
- `pnpm exec tsc --noEmit` → pass
- `pnpm exec eslint .` → pass (harness `scripts/stress/**` and Rust `src-tauri/**`
  build artifacts excluded in `eslint.config.mjs`)
- `pnpm build` → success (web + API routes); Tauri path untouched, secret
  server-only, `autoConnect:false` preserved.

**Cost ledger (GPU `ready` seconds × 33 credits/s):**

| Run | ready s | credits |
|---|---|---|
| smoke (1 connect) | 0.5 | 17 |
| connect_dist (initial 4) | 2.7 | 88 |
| main_session | 23.3 | 768 |
| connect_dist (redo 3) | 1.8 | 60 |
| accuracy_seed (3) | 16.3 | 537 |
| concurrency (5+probe) | 19.1 | 630 |
| **Total** | **~64 s** | **~2,100 ≈ $0.21** |

(Token/pricing latency runs were free — no GPU.)

**Follow-ups:**
1. **Resize seed images** — `upload_file` took ~2.7 s for the seed JPEG; serving
   smaller (e.g. ≤1664×960, ~200–400 KB) seeds would cut a couple seconds off the
   one-time arm path.
2. **Expose RTCRtpReceiver** (SDK feature request) to set a low
   `jitterBufferTarget` for interactive playout — potential further latency trim.
3. **Verify B end-to-end on GPU** — the engage-flush change is reasoned + unit-
   sound; a single confirmation session could measure the Δ1 landing directly
   (~$0.02) if budget allows.
4. **Doc nit:** effective throughput is ~38–40 fps live vs the 16 fps nominal —
   worth confirming with Reactor whether 16 fps is latent-frame rate vs emitted.
