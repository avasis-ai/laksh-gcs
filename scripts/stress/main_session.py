"""Phase 1 — main session: connection timing, TTFF, chunk cadence/throughput,
jitter, and command responsiveness — folded into ONE billed session to save cost.

Hard caps: READY time is bounded by READY_CAP_S; the whole run is wrapped in a
wall-clock timeout; disconnect() (non-recoverable) ALWAYS runs in finally.
"""
import sys
import time
import asyncio
from reactor_sdk import Reactor, ReactorStatus

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from gpu_lib import (API_KEY, API_URL, SEED_IMAGE, credits_for, dollars, frame_hash,  # noqa
                     mean, pctl, install_quiet_loop, wait_ready)

READY_CAP_S = 40.0          # absolute max seconds we let `ready`/billing run
PROMPT = ("mid-altitude aerial drone FPV view, slight downward tilt, surveillance framing, "
          "snow-capped Himalayan peaks, frozen ridgelines and pine forests far below, "
          "bright midday sun, clear visibility, photoreal, cinematic, sharp sensor optics")
SEED = 42


async def main():
    assert API_KEY, "no REACTOR_API_KEY"
    install_quiet_loop()
    r = Reactor(model_name="lingbot", api_key=API_KEY, api_url=API_URL)

    t = {}                 # status -> first perf_counter timestamp
    frames = []            # perf_counter of each frame
    first_frame_hash = {"h": None}
    chunks = []            # (perf_counter, chunk_index, active_action, frames_emitted)
    msg_log = []
    image_accepted_at = {"t": None}

    @r.on_status
    def _st(status):
        if status not in t:
            t[status] = time.perf_counter()

    @r.on_frame
    def _f(frame):
        now = time.perf_counter()
        frames.append(now)
        if first_frame_hash["h"] is None:
            first_frame_hash["h"] = frame_hash(frame)
            first_frame_hash["shape"] = getattr(frame, "shape", None)

    @r.on_message
    def _m(msg):
        try:
            mtype = msg.get("type") if isinstance(msg, dict) else getattr(msg, "type", None)
            data = msg.get("data") if isinstance(msg, dict) else getattr(msg, "data", {})
        except Exception:
            return
        msg_log.append((time.perf_counter(), mtype))
        if mtype == "image_accepted" and image_accepted_at["t"] is None:
            image_accepted_at["t"] = time.perf_counter()
        if mtype == "chunk_complete":
            chunks.append((time.perf_counter(), data.get("chunk_index"),
                           data.get("active_action"), data.get("frames_emitted")))

    ready_t0 = None
    cmd_marker = {}
    try:
        connect_t0 = time.perf_counter()
        await asyncio.wait_for(r.connect(), timeout=45)
        connect_returned = time.perf_counter()
        await asyncio.wait_for(wait_ready(r), timeout=60)
        ready_t0 = time.perf_counter()  # billing starts ~here (true READY)

        # ----- upload + image_accepted-gated ordering -----
        up_t0 = time.perf_counter()
        ref = await r.upload_file(open(SEED_IMAGE, "rb"))
        up_ms = (time.perf_counter() - up_t0) * 1000

        await r.send_command("set_image", {"image": ref})
        # wait for image_accepted (max 15s)
        wait0 = time.perf_counter()
        while image_accepted_at["t"] is None and time.perf_counter() - wait0 < 15:
            await asyncio.sleep(0.05)
        img_ms = (image_accepted_at["t"] - wait0) * 1000 if image_accepted_at["t"] else None

        await r.send_command("set_seed", {"seed": SEED})
        await r.send_command("set_prompt", {"prompt": PROMPT})
        await r.send_command("set_rotation_speed_deg", {"rotation_speed_deg": 18.0})

        start_t0 = time.perf_counter()
        await r.send_command("start", {})

        # ----- let it stream, then inject a movement command for responsiveness -----
        # wait until ~6 chunks have landed (steady state) or 18s
        while len(chunks) < 6 and time.perf_counter() - ready_t0 < 18:
            await asyncio.sleep(0.05)

        # command responsiveness: send forward, mark the chunk index at send time
        cmd_marker["sent_t"] = time.perf_counter()
        cmd_marker["chunk_at_send"] = chunks[-1][1] if chunks else None
        await r.send_command("set_movement", {"movement": "forward"})

        # observe until the movement lands in chunk_complete.active_action
        while time.perf_counter() - ready_t0 < READY_CAP_S:
            if chunks and chunks[-1][2] and chunks[-1][2] not in ("still", "", None):
                # movement reflected
                if "landed_t" not in cmd_marker:
                    cmd_marker["landed_t"] = chunks[-1][0]
                    cmd_marker["chunk_at_land"] = chunks[-1][1]
                    cmd_marker["landed_action"] = chunks[-1][2]
                    break
            await asyncio.sleep(0.03)

        # collect a bit more cadence after the command, respecting the cap
        while time.perf_counter() - ready_t0 < READY_CAP_S and len(chunks) < 30:
            await asyncio.sleep(0.05)

        await r.send_command("set_movement", {"movement": "idle"})

    finally:
        try:
            await asyncio.wait_for(r.disconnect(), timeout=10)  # non-recoverable
        except Exception as e:
            print(f"!! disconnect error: {e}", file=sys.stderr)

    # ---------------- report ----------------
    ready_secs = (time.perf_counter() - ready_t0) if ready_t0 else 0
    print(f"\n===== PHASE 1: main session =====")
    # connection timings (perf_counter relative)
    def rel(status):
        if status in t and ReactorStatus.CONNECTING in t:
            return (t[status] - t[ReactorStatus.CONNECTING]) * 1000
        return None
    base = t.get(ReactorStatus.CONNECTING)
    print("-- connection --")
    for s in (ReactorStatus.CONNECTING, ReactorStatus.WAITING, ReactorStatus.READY):
        if s in t and base:
            print(f"   {s.value:>11}: +{(t[s]-base)*1000:8.1f} ms")
    if ready_t0:
        print(f"   connect() returned (→waiting): {(connect_returned-connect_t0)*1000:.1f} ms")
        print(f"   connect()→READY wall (GPU assigned): {(ready_t0-connect_t0)*1000:.1f} ms")

    print("-- seed/upload --")
    print(f"   upload_file: {up_ms:.1f} ms")
    print(f"   image_accepted after set_image: {img_ms:.1f} ms" if img_ms else "   image_accepted: (timed out)")

    # TTFF
    if frames:
        ttff = (frames[0] - start_t0) * 1000
        print("-- TTFF / frames --")
        print(f"   start()→first frame: {ttff:.1f} ms")
        print(f"   first frame shape={first_frame_hash.get('shape')} hash={first_frame_hash['h']}")
        # steady-state fps from inter-frame intervals (drop first 16)
        if len(frames) > 20:
            ivs = [(frames[i] - frames[i - 1]) for i in range(17, len(frames))]
            if ivs:
                fps = 1.0 / mean(ivs)
                jitter_ms = (pctl(ivs, 95) - pctl(ivs, 50)) * 1000
                print(f"   total frames={len(frames)} steady fps~{fps:.2f} "
                      f"(target 16)  interframe p50={pctl(ivs,50)*1000:.1f}ms p95={pctl(ivs,95)*1000:.1f}ms jitter~{jitter_ms:.1f}ms")

    # first chunk_complete
    if chunks:
        tt_first_chunk = (chunks[0][0] - start_t0) * 1000
        print("-- chunk cadence --")
        print(f"   start()→first chunk_complete: {tt_first_chunk:.1f} ms")
        intervals = [(chunks[i][0] - chunks[i - 1][0]) for i in range(1, len(chunks))]
        if intervals:
            print(f"   chunks={len(chunks)} inter-chunk p50={pctl(intervals,50)*1000:.1f}ms "
                  f"p95={pctl(intervals,95)*1000:.1f}ms mean={mean(intervals)*1000:.1f}ms")
        femit = [c[3] for c in chunks if c[3]]
        if femit:
            print(f"   frames_emitted/chunk: mean={mean(femit):.1f} (set {sorted(set(femit))})")

    # command responsiveness
    print("-- command responsiveness (set_movement forward) --")
    if "landed_t" in cmd_marker:
        lat = (cmd_marker["landed_t"] - cmd_marker["sent_t"]) * 1000
        dchunks = (cmd_marker.get("chunk_at_land") or 0) - (cmd_marker.get("chunk_at_send") or 0)
        print(f"   sent at chunk {cmd_marker.get('chunk_at_send')}, landed at chunk "
              f"{cmd_marker.get('chunk_at_land')} (Δ{dchunks} chunks) action='{cmd_marker.get('landed_action')}'")
        print(f"   send→reflected latency: {lat:.1f} ms")
    else:
        print("   (command did not visibly land within cap)")

    print("-- cost --")
    cr = credits_for(ready_secs)
    print(f"   READY ~{ready_secs:.1f}s  ≈ {cr:.0f} credits ≈ ${dollars(cr):.4f}")
    # machine-readable tail for aggregation
    print(f"COST_CREDITS={cr:.0f}")


if __name__ == "__main__":
    asyncio.run(main())
