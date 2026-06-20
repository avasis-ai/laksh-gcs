# Laksh — World Consistency (anti-morph) Findings & Fixes

**Product:** Laksh (CelesticLabs) — Reactor LingBot UAV world-model GCS.
**Problem:** operators reported the generated world / "drone model" **morphing**
(geometry, structures and layout drifting) as they fly, instead of staying one
coherent persistent world.
**Scope:** prompt stability, fixed seed, movement/turn-rate, image anchoring.
Preserves the prior stress-test tuning (JWT cache, coalescer immediate
engage-flush, fixed seed=42).

---

## 1. Research

### Official LingBot (https://lingbot-world.com)
- LingBot is explicitly built around **long-term spatial memory**: "objects
  remain stable even after 60+ seconds, eliminating the *ghost wall* problem",
  "physics-aware … spatial reasoning stays coherent." So the model is *designed*
  to hold a persistent world — drift is usually something **we** induce.
- The released variant is **LingBot-World-Base (Cam)**, tuned for "push-in
  shots, orbits, pans and **smooth camera movements**." Smooth, low-rate camera
  motion is the model's happy path; jerky high-rate look is not.
- Controls are WASD + look; the world is seeded by an image and steered by text.

### Real-time / autoregressive world-model consistency (general)
Consistent with the playbook §4.4 sources (Self-Forcing, Causal Forcing,
MotionStream, minWM): these models roll a **KV/context cache** forward frame by
frame. Two things break coherence:
1. **Conditioning churn** — changing the text conditioning frequently makes each
   chunk re-interpret the scene → geometry/architecture warp at boundaries.
2. **Fast novel viewpoints** — large yaw/pitch per step pushes lots of
   *unseen* area into frame, which must be hallucinated fresh and rarely matches
   what was there before (turn around, the building changed).
Stabilisers: a **fixed seed**, a **stable repeated prompt**, **slower/smoother
turn rate**, and a strong **image/prompt anchor** at start.

---

## 2. Diagnosis — why Laksh was morphing

| # | Root cause | Evidence in code (before) |
|---|---|---|
| 1 | **Prompt churn on every scene edit.** A `useEffect([scene])` re-sent `setPrompt` on *every* change — including **every keystroke** in the base textarea and chip toggles — with no dedup or debounce. Each re-emit lands at a chunk boundary and nudges the model to re-interpret the world. | `emitPromptIfLive` called unconditionally; no diff, no debounce. |
| 2 | **Identical/duplicate prompt re-emits.** `injectEvent`/`injectCustomTarget` set the scene *and* called emit, while the `[scene]` effect also fired → the same prompt sent twice; toggling a chip back re-sent a prompt already on the wire. | no last-sent tracking. |
| 3 | **Turn rate too high.** `DEFAULT_COMPILE.sensitivity = 18` and the start command sent `rotation_speed_deg = 18` (Reactor default is 5.0). Full-deflection look spun the camera fast → maximal novel-viewpoint drift. | `control.ts` / `StudioProvider` defaults. |
| 4 | **Weak persistence phrasing, only under ENHANCE.** The anti-morph clause lived inside the ENHANCE-only quality cues, so with ENHANCE off there was *no* persistence anchor at all. | `scene.ts` `QUALITY_CUES`. |

Confirmed already-correct (kept): **fixed seed=42** is set *before* `setPrompt`
and `start` and never changed mid-run; the **`set_image → await image_accepted →
setSeed → setPrompt → start`** ordering anchors the world (stress-test §2.6).

---

## 3. Fixes applied

### A. Prompt-churn control — `components/StudioProvider.tsx`
- **Dedup:** track `lastSentPromptRef`; never send a prompt identical to the one
  already on the wire. Re-renders, chip-toggle-backs and the double emit/effect
  path all collapse to a no-op.
- **Debounce (350 ms):** reactive scene edits (esp. typing in the base textarea)
  coalesce into a **single** `setPrompt` instead of one per keystroke. Deliberate
  actions (re-task button, target injection, unlock) emit **immediately**.
- `lastSentPromptRef` is seeded on `start`/re-task and cleared on `stop`/`reset`.
- **Expected effect:** the prompt now changes only when it *meaningfully*
  changes, and at most a few times per second — removing the dominant morph
  driver while keeping live re-tasking responsive.

### B. "Lock World" affordance — `StudioProvider` + `Sidebar`
- A `worldLocked` toggle (shown in the tasking rail while live) **freezes prompt
  re-emission** entirely during free-flight, so movement/look never trigger a
  prompt-driven morph. Unlocking flushes the current scene so the world catches
  up. Markers/telemetry are unaffected.
- **Expected effect:** an explicit "hold this world steady while I fly" mode —
  maximal stability for navigation-heavy use.

### C. Lower default turn rate — `lib/laksh/control.ts` + `StudioProvider`
- `DEFAULT_SENSITIVITY = 11` (was 18); start now sends a gentler
  `rotation_speed_deg`. Slider still reaches 30 for operators who want snap.
- **Expected effect:** smoother, slower look = fewer fast novel viewpoints =
  markedly less geometry drift, matching LingBot's "smooth camera" sweet spot.
  HUD rotation scaling tracks the same value, so feel stays consistent.

### D. Always-on persistence anchor — `lib/laksh/scene.ts`
- New `STABILITY_CUES` ("a single coherent persistent world, the same location
  throughout, stable consistent geometry and architecture, temporally stable,
  locked layout, no morphing") is **always appended** (independent of ENHANCE),
  phrased positively (LingBot ignores negatives), and kept **identical run-to-
  run** so it never itself causes churn.
- `composePrompt` now budgets this fixed tail (+ optional quality cues) **first**,
  trimming only the variable body (events first) if the 1000-char cap is hit, so
  the anchor is **never truncated away**.
- Mission `promptSeed`s also reinforce a single fixed location ("the same …",
  "one continuous … sector").
- **Expected effect:** a constant, repeated persistence signal paired with the
  fixed seed — the model's own long-term memory is reinforced rather than fought.

### Considered, not done (avoiding cargo-cult)
- **`set_image_strength` / anchor-interval re-grounding:** those are Helios /
  SANA commands — LingBot has no such command (reactor.md). Not applicable.
- **Auto-`idle` look recenter to reduce drift:** already available via the
  Stabilised profile; no change needed.

---

## 4. Net effect

Morphing was primarily **self-inflicted prompt churn + an over-fast turn rate**,
not a model limitation. After the fixes the composed prompt is stable and
de-duplicated, the turn rate is gentle by default, a persistence anchor is always
present, and operators can hard-freeze the world via Lock World. The fixed seed
and image-anchored start ordering (already correct) are preserved.

**Validation:** `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm build`,
`pnpm build:tauri` all clean; dev server `GET / → 200` with the defence missions
rendering. Live WebRTC A/B of drift was not run (no live flight in this pass) —
follow-up below.

## 5. Follow-ups
1. **Live GPU confirmation** of reduced drift (short session): compare frame MAD
   across a fixed yaw sweep at sensitivity 11 vs 18, locked vs unlocked.
2. Consider a per-mission default sensitivity (e.g. chase missions slightly
   higher) if operators want it.
