"""Phase 4 — concurrency cap. Open sessions up to the 5-account limit, then
attempt a 6th and confirm the platform rejects it (429 / error). Holds the
sessions only briefly, then disconnects ALL non-recoverably.

Sessions in connecting/waiting already count toward the cap, so we don't need
all 5 to reach READY — but we drive them to ready to be realistic, briefly.
"""
import sys
import time
import asyncio
from reactor_sdk import Reactor

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from gpu_lib import API_KEY, API_URL, credits_for, dollars, install_quiet_loop, wait_ready  # noqa

CAP = 5
HOLD_S = 2.0


async def open_one(idx, hold_evt, results):
    r = Reactor(model_name="lingbot", api_key=API_KEY, api_url=API_URL)
    ready_secs = 0
    rt0 = None
    try:
        await asyncio.wait_for(r.connect(), timeout=45)
        rt0 = await asyncio.wait_for(wait_ready(r), timeout=60)
        results[idx] = "ready"
        await hold_evt.wait()  # hold until the 6th-session probe completes
    except Exception as e:
        results[idx] = f"err:{type(e).__name__}:{str(e)[:80]}"
    finally:
        if rt0:
            ready_secs = time.perf_counter() - rt0
        try:
            await asyncio.wait_for(r.disconnect(), timeout=10)
        except Exception:
            pass
    return ready_secs


async def probe_sixth():
    """Attempt a 6th session; expect rejection. Capture the error verbatim."""
    r = Reactor(model_name="lingbot", api_key=API_KEY, api_url=API_URL)
    try:
        await asyncio.wait_for(r.connect(), timeout=30)
        # if it somehow connected, wait_ready briefly to see if GPU is granted
        try:
            await asyncio.wait_for(wait_ready(r), timeout=8)
            outcome = "UNEXPECTEDLY READY (no cap hit)"
        except Exception:
            outcome = "connected but never READY (queued/blocked)"
        await asyncio.wait_for(r.disconnect(), timeout=10)
        return outcome
    except Exception as e:
        try:
            await r.disconnect()
        except Exception:
            pass
        return f"REJECTED: {type(e).__name__}: {str(e)[:160]}"


async def main():
    assert API_KEY
    install_quiet_loop()
    print(f"===== PHASE 4: concurrency cap (open {CAP}, probe {CAP+1}th) =====")
    hold_evt = asyncio.Event()
    results = {}
    tasks = [asyncio.create_task(open_one(i, hold_evt, results)) for i in range(CAP)]

    # wait until all 5 reach ready (or error), max 70s
    t0 = time.perf_counter()
    while len([v for v in results.values() if v]) < CAP and time.perf_counter() - t0 < 70:
        await asyncio.sleep(0.1)
    ready_count = len([v for v in results.values() if v == "ready"])
    print(f"  reached ready: {ready_count}/{CAP}  states={results}")

    await asyncio.sleep(HOLD_S)

    # probe the 6th while 5 are held open
    print("  probing 6th session…")
    sixth = await probe_sixth()
    print(f"  6th session → {sixth}")

    # release the held sessions
    hold_evt.set()
    ready_secs_list = await asyncio.gather(*tasks)

    total = sum(ready_secs_list)
    cr = credits_for(total)
    print(f"  cost: total READY ~{total:.1f}s ≈ {cr:.0f} credits ≈ ${dollars(cr):.4f}")
    print(f"COST_CREDITS={cr:.0f}")


if __name__ == "__main__":
    asyncio.run(main())
