"""Phase 2 — connection-latency distribution. Connect → ready → IMMEDIATE
non-recoverable disconnect, repeated N times. Minimises `ready` billing
(disconnects the instant ready is observed). Each cycle ~ a few seconds ready.
"""
import sys
import time
import asyncio
from reactor_sdk import Reactor, ReactorStatus

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from gpu_lib import API_KEY, API_URL, credits_for, dollars, mean, pctl, install_quiet_loop, wait_ready  # noqa

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1


async def one_cycle():
    r = Reactor(model_name="lingbot", api_key=API_KEY, api_url=API_URL)
    t = {}

    @r.on_status
    def _st(status):
        t.setdefault(status, time.perf_counter())

    ready_t0 = None
    try:
        c0 = time.perf_counter()
        await asyncio.wait_for(r.connect(), timeout=45)
        connect_returned = time.perf_counter()
        await asyncio.wait_for(wait_ready(r), timeout=60)
        ready_t0 = time.perf_counter()
    finally:
        try:
            await asyncio.wait_for(r.disconnect(), timeout=10)
        except Exception as e:
            print(f"!! disconnect error: {e}", file=sys.stderr)

    base = t.get(ReactorStatus.CONNECTING, c0)
    to_waiting = (t[ReactorStatus.WAITING] - base) * 1000 if ReactorStatus.WAITING in t else None
    to_ready = (t[ReactorStatus.READY] - base) * 1000 if ReactorStatus.READY in t else None
    wall = (ready_t0 - c0) * 1000 if ready_t0 else None
    ready_secs = (time.perf_counter() - ready_t0) if ready_t0 else 0
    return to_waiting, to_ready, wall, ready_secs


async def main():
    assert API_KEY
    install_quiet_loop()
    waits, readys, walls = [], [], []
    total_ready = 0.0
    for i in range(N):
        tw, tr, wall, rs = await one_cycle()
        total_ready += rs
        if tw is not None:
            waits.append(tw)
        if tr is not None:
            readys.append(tr)
        if wall is not None:
            walls.append(wall)
        print(f"  cycle {i+1}/{N}: →waiting={tw and round(tw,1)}ms →ready={tr and round(tr,1)}ms "
              f"wall={wall and round(wall,1)}ms ready_held={rs:.1f}s")
        await asyncio.sleep(1.0)

    print(f"\n===== PHASE 2: connection distribution (n={N}) =====")
    if waits:
        print(f"  connect→waiting:  p50={pctl(waits,50):.1f} p95={pctl(waits,95):.1f} mean={mean(waits):.1f} ms")
    # connect() awaits until ready, so wall time IS connect→ready (GPU assignment).
    if walls:
        print(f"  connect→ready:    p50={pctl(walls,50):.1f} p95={pctl(walls,95):.1f} "
              f"min={min(walls):.1f} max={max(walls):.1f} mean={mean(walls):.1f} ms")
    cr = credits_for(total_ready)
    print(f"  cost: READY ~{total_ready:.1f}s ≈ {cr:.0f} credits ≈ ${dollars(cr):.4f}")
    print(f"COST_CREDITS={cr:.0f}")


if __name__ == "__main__":
    asyncio.run(main())
