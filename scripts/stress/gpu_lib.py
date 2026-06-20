"""Shared helpers for the Laksh GPU stress harness (scratch tooling).

COST GUARDRAILS baked in:
  * lingbot bills 33 credits/sec only in `ready` (10000 credits = $1).
  * Every session uses a hard wall-clock cap and ALWAYS disconnects
    non-recoverably in a finally block.
"""
import os
import re
import time
import asyncio
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LINGBOT_RATE = 33  # credits/sec (confirmed live from /pricing)


def load_env():
    env = {}
    p = ROOT / ".env.local"
    if p.exists():
        for line in p.read_text().splitlines():
            m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


ENV = load_env()
API_KEY = ENV.get("REACTOR_API_KEY") or os.environ.get("REACTOR_API_KEY")
API_URL = (ENV.get("REACTOR_API_URL") or "https://api.reactor.inc").rstrip("/")

SEED_IMAGE = ROOT / "public" / "references" / "laksh" / "operation-sindoor-kashmir.jpg"


def credits_for(ready_secs):
    return ready_secs * LINGBOT_RATE


def dollars(credits):
    return credits / 10000.0


def frame_hash(frame):
    """Stable hash of a frame ndarray for reproducibility comparison."""
    try:
        return hashlib.sha1(frame.tobytes()).hexdigest()[:16]
    except Exception:
        return None


def install_quiet_loop():
    """Silence the harmless aioice STUN-retry spew that fires after the UDP
    transport is torn down on disconnect()."""
    import asyncio

    def handler(loop, context):
        exc = context.get("exception")
        msg = context.get("message", "")
        if isinstance(exc, AttributeError) and "sendto" in str(exc):
            return
        if "Fatal write error on datagram transport" in msg:
            return
        # surface anything genuinely unexpected
        print(f"[loop] {msg} {exc!r}", file=__import__("sys").stderr)

    try:
        asyncio.get_event_loop().set_exception_handler(handler)
    except Exception:
        pass


async def wait_ready(reactor, timeout=60):
    """Poll until the session is actually READY (GPU assigned). connect() in this
    SDK returns at `waiting`, so billing/commands require this extra wait."""
    import asyncio as _a
    from reactor_sdk import ReactorStatus as _S
    t0 = time.perf_counter()
    while reactor.get_status() != _S.READY:
        if time.perf_counter() - t0 > timeout:
            raise TimeoutError(f"never reached ready (stuck at {reactor.get_status()})")
        await _a.sleep(0.02)
    return time.perf_counter()


def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def pctl(xs, p):
    if not xs:
        return float("nan")
    s = sorted(xs)
    i = min(len(s) - 1, max(0, int(round((p / 100) * len(s) + 0.5)) - 1))
    return s[i]
