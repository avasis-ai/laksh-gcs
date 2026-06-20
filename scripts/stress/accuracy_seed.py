"""Phase 3 — accuracy levers: fixed-seed reproducibility.

Runs 3 short sessions (same image + same prompt):
  A: seed=42, B: seed=42, C: seed=777
Decoded WebRTC frames are NOT bit-identical (lossy codec), so we compare the
first decoded frame with a normalized mean-abs-difference (MAD) on a grayscale
downsample. Expect MAD(A,B) << MAD(A,C) if the seed reproduces the world.

Each session is capped: it grabs the first frame + a couple chunks then
disconnects non-recoverably.
"""
import sys
import time
import asyncio
import numpy as np
from reactor_sdk import Reactor

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from gpu_lib import (API_KEY, API_URL, SEED_IMAGE, credits_for, dollars,  # noqa
                     install_quiet_loop, wait_ready)

PROMPT = ("mid-altitude aerial drone FPV view, slight downward tilt, surveillance framing, "
          "snow-capped Himalayan peaks, bright midday sun, clear visibility, photoreal")


def downsample(frame, n=48):
    # grayscale + coarse block-average to a n x n grid → robust to codec noise
    g = frame.astype(np.float32).mean(axis=2)
    h, w = g.shape
    ys = (np.linspace(0, h, n + 1)).astype(int)
    xs = (np.linspace(0, w, n + 1)).astype(int)
    out = np.zeros((n, n), np.float32)
    for i in range(n):
        for j in range(n):
            out[i, j] = g[ys[i]:ys[i + 1], xs[j]:xs[j + 1]].mean()
    return out


def mad(a, b):
    return float(np.abs(a - b).mean())


async def run_session(seed):
    r = Reactor(model_name="lingbot", api_key=API_KEY, api_url=API_URL)
    grabbed = {"frame": None, "n": 0}
    img_ok = {"t": None}

    @r.on_frame
    def _f(frame):
        grabbed["n"] += 1
        # grab a settled frame (skip the very first couple, take ~the 20th)
        if grabbed["frame"] is None and grabbed["n"] >= 20:
            grabbed["frame"] = downsample(frame)

    @r.on_message
    def _m(msg):
        mt = msg.get("type") if isinstance(msg, dict) else None
        if mt == "image_accepted":
            img_ok["t"] = time.perf_counter()

    ready_secs = 0
    try:
        await asyncio.wait_for(r.connect(), timeout=45)
        rt0 = await asyncio.wait_for(wait_ready(r), timeout=60)
        ref = await r.upload_file(open(SEED_IMAGE, "rb"))
        await r.send_command("set_image", {"image": ref})
        w0 = time.perf_counter()
        while img_ok["t"] is None and time.perf_counter() - w0 < 15:
            await asyncio.sleep(0.05)
        await r.send_command("set_seed", {"seed": seed})
        await r.send_command("set_prompt", {"prompt": PROMPT})
        await r.send_command("start", {})
        # wait until we grab a settled frame or 12s cap
        while grabbed["frame"] is None and time.perf_counter() - rt0 < 12:
            await asyncio.sleep(0.05)
        ready_secs = time.perf_counter() - rt0
    finally:
        try:
            await asyncio.wait_for(r.disconnect(), timeout=10)
        except Exception as e:
            print(f"!! disconnect: {e}", file=sys.stderr)
    return grabbed["frame"], ready_secs


async def main():
    assert API_KEY
    install_quiet_loop()
    total = 0.0
    runs = [("A", 42), ("B", 42), ("C", 777)]
    frames = {}
    for label, seed in runs:
        f, rs = await run_session(seed)
        total += rs
        frames[label] = f
        print(f"  session {label} seed={seed}: frame={'grabbed' if f is not None else 'MISSED'} ready~{rs:.1f}s")
        await asyncio.sleep(1.0)

    print("\n===== PHASE 3: seed reproducibility =====")
    A, B, C = frames["A"], frames["B"], frames["C"]
    if A is not None and B is not None and C is not None:
        ab = mad(A, B)
        ac = mad(A, C)
        bc = mad(B, C)
        # normalize by dynamic range (~0..255)
        print(f"  MAD(A,B) same seed=42 : {ab:.2f}")
        print(f"  MAD(A,C) seed 42 vs 777: {ac:.2f}")
        print(f"  MAD(B,C) seed 42 vs 777: {bc:.2f}")
        ratio = ac / ab if ab > 0 else float("inf")
        print(f"  >> same-seed vs diff-seed ratio: {ratio:.2f}x "
              f"({'REPRODUCIBLE' if ab < ac * 0.6 else 'inconclusive'})")
    else:
        print("  (one or more frames missed — inconclusive)")
    cr = credits_for(total)
    print(f"  cost: READY ~{total:.1f}s ≈ {cr:.0f} credits ≈ ${dollars(cr):.4f}")
    print(f"COST_CREDITS={cr:.0f}")


if __name__ == "__main__":
    asyncio.run(main())
