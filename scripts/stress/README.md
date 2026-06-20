# Laksh / Reactor stress-test harness

Scratch tooling used to measure the **live** Reactor LingBot platform and our
infra. **Not part of the shipped app** — excluded from eslint (`scripts/stress/**`)
and not matched by the `tsconfig` include globs. Findings are written up in
[`docs/research/stress-test.md`](../../docs/research/stress-test.md).

## Cost guardrails (LingBot bills 33 credits/sec only in `ready`; 10k credits = $1)

Every GPU script:
- waits for **true `ready`** before doing work (connect() returns at `waiting`),
- caps `ready` time per session and wraps the run in a wall-clock timeout,
- **always** `disconnect()`s non-recoverably in a `finally` block,
- prints a `COST_CREDITS=…` line for tallying.

Total spend for the full sweep: **~2,100 credits ≈ $0.21**.

## Files

| File | Phase | GPU? | Measures |
|---|---|---|---|
| `token-latency.mjs` | 0 | no | `POST /tokens` latency (seq + bursts), `/pricing` payload + caching |
| `connect_dist.py` | 2 | yes | connect→waiting, connect→ready distribution (N cycles) |
| `main_session.py` | 1 | yes | TTFF, chunk cadence/throughput/jitter, command responsiveness |
| `accuracy_seed.py` | 3 | yes | fixed-seed reproducibility (same vs different seed, frame MAD) |
| `concurrency.py` | 4 | yes | 5-session cap + 6th-session 429 rejection |
| `gpu_lib.py` / `lib.mjs` | — | — | shared helpers (env load, stats, cost, ready-wait) |
| `results/` | — | — | captured run output |

## Running

```bash
# Free (no GPU):
node scripts/stress/token-latency.mjs

# GPU (Python venv with reactor-sdk + aiortc):
python3 -m venv /tmp/laksh-venv && /tmp/laksh-venv/bin/pip install reactor-sdk
/tmp/laksh-venv/bin/python scripts/stress/connect_dist.py 3
/tmp/laksh-venv/bin/python scripts/stress/main_session.py
/tmp/laksh-venv/bin/python scripts/stress/accuracy_seed.py
/tmp/laksh-venv/bin/python scripts/stress/concurrency.py
```

Reads `REACTOR_API_KEY` from `.env.local`. The aioice STUN spew on teardown is
harmless (UDP socket closed before the last keepalive); filter with
`2>/dev/null`.
