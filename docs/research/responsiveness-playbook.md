# Laksh — Responsiveness & Latency Playbook

**Product:** Laksh (CelesticLabs Pvt. Ltd.) — real-time interactive AI World Model dashboard for DRONE / UAV defence.
**Platform:** Reactor (generative video world models, streamed over WebRTC, sub‑1s latency) via `@reactor-team/js-sdk` + `@reactor-models/lingbot`.
**Base prototype:** LingBot dashboard at repo root (Next.js 16, React 19, Tailwind 4). Seed image + prompt → infinite navigable world; WASD movement + look (yaw/pitch); commands apply at chunk boundaries; 16 fps; 1664×960.

This document extracts concrete, transferable patterns from three open-source projects and synthesises a playbook for making Laksh faster and more responsive. It is research only — **no application code was modified.**

---

## 0. How the current LingBot prototype actually works (ground truth)

Read directly from the SDK type defs (`node_modules/@reactor-models/lingbot/dist/core.d.ts`), the js-sdk (`@reactor-team/js-sdk/dist/index.d.ts`), and `components/StudioProvider.tsx` / `components/Controls.tsx`.

### Command surface (the only control primitives we have)

| Command | Param / values | Timing semantics | Notes for UAV mapping |
|---|---|---|---|
| `setMovement` | `idle \| forward \| back \| strafe_left \| strafe_right` | **Persistent state**; applies at **next chunk** | Single-axis translate. No diagonal, no speed scalar. |
| `setLookHorizontal` | `idle \| left \| right` | Persistent; next chunk | Yaw. |
| `setLookVertical` | `idle \| up \| down` | Persistent; next chunk | Pitch (camera tilt). |
| `setRotationSpeedDeg` | `0.0 – 30.0` deg/latent-frame | Persistent; next chunk | The **only** continuous magnitude knob — shared by yaw & pitch. |
| `setPrompt` | string | Hot-swappable; **applied on next chunk** | Scene/weather/target steering. |
| `setImage` | `FileRef` | Pre-`start` only; needs `reset` to change | Seed frame. Emits `image_accepted`. |
| `setSeed` | int ≥0 | Read once at `start` | Reproducible runs. |
| `start / pause / resume / reset` | — | lifecycle | `pause` takes effect after the current chunk finishes. |

**Critical constraint:** Every control is **discrete + persistent + chunk-quantised**. There is no per-frame analog channel. You set a state; it holds until you change it; the change lands on the *next chunk boundary*. Movement is one-of-five (mutually exclusive), look H and look V are independent, and a single `rotation_speed_deg` governs angular rate for both.

### State & telemetry feedback (model → client)

- `state` message (source of truth): `running`, `started`, `paused`, `movement`, `look_horizontal`, `look_vertical`, `rotation_speed_deg`, `current_action` (e.g. `w+left`), `current_chunk`, `current_prompt`, `has_image/has_prompt`.
- `chunk_complete`: `chunk_index`, `active_action`, `active_prompt`, `frames_emitted` → **the heartbeat that defines the control cadence.**
- `generation_started`: `chunk_num`, `frame_num`. `generation_complete`: auto-restarts run if still `started`.
- Lifecycle/error events: `image_accepted`, `prompt_accepted`, `conditions_ready`, `command_error`, `generation_reset/paused/resumed`.

### Connection telemetry (js-sdk — actual field names)

`ConnectionStats` (from `useStats()`, updates ~every 2 s): `rtt`, `candidateType` (`host/srflx/prflx/relay`), `framesPerSecond`, `packetLossRatio` (0–1), `jitter` (seconds), `availableIncomingBitrate`, `connectionTimings` (`totalMs` connect→ready, set once). `ConnectOptions`: `maxAttempts` (SDP poll, default 6), `autoResumeTracks`. React: `autoConnect` (default false).

> The prototype already does two smart things: (1) **`autoConnect: false`** — connects only on Generate, so idle GPU time is free; (2) it **waits for `image_accepted`** before `start` to dodge the first-chunk race. The SDK also pre-declares `LingbotTracks` so the SDP offer is prepared *in parallel* with session polling for faster first-frame.

---

## 1. Repo study: Colosseum (AirSim fork)

**What it is:** A maintained fork of Microsoft AirSim — a high-fidelity drone/car simulator built as an Unreal Engine (and Unity) plugin, with a language-agnostic RPC client API. Aimed at autonomy / RL / CV research for UAVs.

**Tech stack:** C++ core (`AirLib`) inside Unreal; **msgpack-rpc** server; Python/C++/ROS clients (`pip install msgpack-rpc-python`). `MultirotorClient` is the drone control facade.

**Architecture / control loop:**
- Client ↔ sim over msgpack-RPC. Commands are `*Async` (return a future you `.join()`) or immediate.
- A **layered command model** from high-level autonomy down to raw actuators — this is the single most useful idea for Laksh's input design:

| Layer | API (examples) | Analogy |
|---|---|---|
| Position / waypoint | `moveToPositionAsync(x,y,z,v)`, `moveOnPathAsync(path,v)`, `moveToGPSAsync`, `rotateToYawAsync` | "Go there" (mission/autopilot) |
| Velocity | `moveByVelocityAsync(vx,vy,vz,dur)`, `moveByVelocityBodyFrameAsync`, `moveByVelocityZAsync(...,z,...)` | "Move this way at this speed" |
| Attitude (Angle mode) | `moveByRollPitchYawZAsync`, `moveByAngleZAsync` | Self-leveling stick→tilt |
| Rate (Acro mode) | `moveByRollPitchYawrateThrottleAsync`, `moveByAngleRatesThrottleAsync` | FPV rate control |
| RC passthrough | `moveByRC(RCData(roll,pitch,yaw,throttle))` | Raw sticks |
| Motors | `moveByMotorPWMsAsync` | ESC-level |

- **`drivetrain` + `YawMode`**: `DrivetrainType.ForwardOnly` makes the airframe face its travel direction (camera follows heading); `MaxDegreeOfFreedom` allows "crab" motion (decoupled heading). `YawMode(is_rate, yaw_or_rate)` chooses *hold an angle* vs *rotate at a rate*. **This coupling of "where I move" vs "where I look" is exactly the LingBot movement-vs-look split.**
- **Coordinate frame:** strict **NED** (X=North, Y=East, **Z=Down**, +Z is down), SI units, body-frame for angular rates. Vehicle spawns at (0,0,0).
- **Camera/sensor streaming:** `simGetImages([ImageRequest(cam, ImageType.Scene/DepthPlanar/Segmentation, ...)])` — pull-based, multi-camera, named cameras incl. `fpv`. `simSetCameraPose` (gimbal). Not a low-latency video transport — it's request/response frame grabs.
- **Environment control (directly mirrors LingBot's prompt-as-environment):** `simSetWind(Vector3r)`, `simSetWeatherParameter(param,val)` (rain/snow/fog/dust/leaves), `simSetTimeOfDay(...)` (sun position from lat/long/date/time).
- **Smoothness pattern (`orbit.py`):** ramps speed up over `ramptime` instead of jumping to target, uses a **lookahead** point ahead on the path, and holds position before snapshots. Anti-jerk by design.

**Transfers to Laksh:**
1. **Layered command abstraction.** Build a Laksh "flight intent" layer (throttle/pitch/roll/yaw/altitude) on top, then *compile down* to the few LingBot primitives. The frontend should think in drone terms, not `strafe_left`.
2. **`drivetrain`/`YawMode` mental model** → decide whether yaw and forward motion are coupled ("nose-follows-travel") in our HUD.
3. **NED + altitude as first-class** — there's no real altitude in LingBot, so altitude/pitch must be *faked* via `look_vertical` + `forward` and/or prompt cues. Document the fiction explicitly.
4. **Environment API parity** — wind/weather/time-of-day map cleanly onto `setPrompt` suffixes (we already have `ATMOSPHERE_EVENTS`).
5. **Ramp-up + lookahead smoothing** for any "auto-fly"/orbit/mission mode we add on top of discrete commands.

---

## 2. Repo study: MiroFish

**What it is:** *Not* a video/streaming project. MiroFish (Shanda Group, built on **OASIS / CAMEL-AI**) is a **multi-agent swarm-intelligence simulation & prediction engine**. From a "seed" (news, report, story) it builds a parallel digital world populated by thousands of LLM agents with personas + memory, simulates social evolution, and lets a user inject variables "from a God's-eye view" to forecast outcomes.

**Tech stack:** Python **Flask** backend (`uv`), **Vue 3 + Vite + d3 + vue-i18n + axios** frontend, GraphRAG + Zep memory, OpenAI-format LLM API. Docker compose (3000 frontend / 5001 backend).

**Architecture / interaction model:** Heavy long-running jobs are **asynchronous task + poll**: `POST /generate` returns a `task_id` immediately; client polls `GET .../status` for progress. Then a **ReportAgent** allows *deep interaction* with the post-simulation world (chat with any agent, inject events).

**Real-time / responsiveness patterns (what's transferable despite being non-video):**
1. **Async-job + status-polling** for any expensive operation (clip rendering, mission replay, scenario build) so the live feed never blocks.
2. **"God's-eye view" dynamic variable injection** into a *running* world — directly analogous to LingBot's `setPrompt` hot-swap. Frame Laksh's prompt/atmosphere/target controls as **"inject an event into the live theatre"** (spawn a convoy, change weather, time-jump to dusk).
3. **Agent/entity layer over the world** — MiroFish's persona agents suggest a Laksh "entities" overlay: scripted targets/threats described into the prompt and tracked client-side as HUD markers, even though the model itself has no object permanence.
4. **Separation of "simulate" vs "interact/report"** modes — Laksh can mirror this: a *Fly* mode (live control) and a *Debrief* mode (clip review, telemetry timeline, d3-style charts).
5. **i18n + axios service layer** — clean client/server separation worth keeping for a defence product (locale, audit).

> Net: MiroFish contributes **interaction-model and architecture** patterns (async jobs, live event injection, entity overlays, dual-mode UX), not streaming/latency mechanics.

---

## 3. Repo study: Unity FPV Drone Simulator

**What it is:** A physics-based FPV drone sim (game-programming assignment) that bridges a real RC transmitter (Radiomaster Pocket, USB-HID) to Unity. Core = `DroneController.cs`, a full flight controller.

**Tech stack:** Unity 2021.3 LTS, C#, **Unity new Input System** (gamepad/HID), `Rigidbody` physics, TMP-based OSD.

**Control → visual feedback loop & "feel" techniques (this repo is gold for input UX):**
- **Three flight modes** selectable on a 3-pos switch, run in `FixedUpdate()`:
  - **Angle (self-level):** stick → target tilt; a **PD controller** (`P = error*strength`, `D = -angularVel*damping`) drives toward it and auto-levels on release.
  - **Acro (rate):** stick → angular *rate* (torque ∝ input); centre stick = instant stop/hold. Enables flips.
  - **Horizon:** runs both (acro + weaker stabilisation).
- **Input shaping = the responsiveness secret sauce:**
  - **Deadzone** (`< ~0.07` → 0, then rescale to keep full range): kills stick drift → "locked-in" centre.
  - **Expo (cubic):** `expo*input³ + (1-expo)*input` → soft, precise near centre; full authority at edges. Applied to acro *and* throttle.
  - **Active yaw damping:** counter-torque `-currentYawRate*damping` brakes unwanted spin.
  - **Throttle remap:** stick `[-1,1] → [0,1]`.
- **Camera rig:** `CameraController.cs` follows the drone in **`LateUpdate`** with `Vector3.Lerp(..., smoothSpeed)` → jitter-free, *dampened* follow (smoothing applied after physics).
- **OSD/HUD:** `OSDController.cs` reads live drone state each `Update()` → MODE / THR% / ALT (relative to start) / VEL — minimal, glanceable, mimics a real FPV feed.

**Transfers to Laksh:**
1. **Deadzone + expo on every analog input** (gamepad sticks, virtual joysticks) *before* it becomes a LingBot command — even though our output is discrete, expo decides *how far a stick must move to trip forward/strafe/look* and how `rotation_speed_deg` scales.
2. **Flight-mode concept** → Laksh "control profiles": *Stabilised* (look auto-recenters to idle on release, like Angle mode) vs *Manual* (look holds, like Acro). LingBot look is persistent (Acro-like) by default; we can *emulate Angle* client-side by auto-sending `idle`.
3. **Dampened follow + smoothing in `LateUpdate`-equivalent** → client-side HUD interpolation should be smoothed/eased, decoupled from the 16 fps video and the ~chunk command tick.
4. **Minimal glanceable OSD** (MODE/THR/ALT/VEL) is the proven FPV HUD baseline.
5. **Yaw damping / auto-recenter** → avoid "runaway yaw": when the user releases look, immediately send `idle` (we already do this in `Controls.tsx`).

---

## 4. Synthesis — Responsiveness & Latency Playbook for Laksh

### 4.1 Input model: drone controls → Reactor primitives

The fundamental challenge: **continuous, multi-axis drone intent → 5 discrete, chunk-quantised, persistent commands.** Strategy = *quantise intent into persistent state, change state only at chunk cadence.*

| Drone control | Source | Maps to | Mapping rule |
|---|---|---|---|
| **Throttle / forward speed** | R-stick fwd / `W` / RT | `setMovement(forward/back)` + `rotation_speed_deg` budget | Above expo'd threshold → `forward`; below → `idle`. No analog speed → optionally encode "fast" via prompt ("high-speed low pass"). |
| **Pitch (nose down/up = climb/dive in FPV)** | R-stick Y | `setLookVertical(up/down)` (+ `forward`) | LingBot has no altitude axis. Treat "dive" = `look down` + `forward`; "climb" = `look up` + `forward`. Document this fiction. |
| **Roll / lateral** | L-stick X / `A`/`D` | `setMovement(strafe_left/right)` | Movement is single-axis & exclusive — see §4.2 priority. |
| **Yaw (heading)** | L-stick X (mode-2) / arrows | `setLookHorizontal(left/right)` | Persistent; sustained until `idle`. |
| **Camera look / gimbal** | Right stick / mouse | `setLookHorizontal/Vertical` | Same channel as yaw/pitch — must arbitrate camera-look vs airframe-yaw in one profile. |
| **Look/turn rate** | Expo + sensitivity setting | `setRotationSpeedDeg(0–30)` | THE analog knob. Bind stick magnitude → 0–30 via expo; clamp per `rc_limits`. |
| **Scene / weather / time / targets** | HUD chips, mission script | `setPrompt` | Hot-swap, lands next chunk. |
| **Reset / RTL / new AO** | buttons | `reset` → `setImage` → `setPrompt` → `start` | Full re-seed; show "re-acquiring" state. |

**Key timing facts to design around:**
- Movement is **mutually exclusive** (no forward+strafe diagonal). Pick a priority or alternate.
- Look H and look V are **independent** and **combine with** movement (`current_action` like `w+left+up`).
- `rotation_speed_deg` is **shared** by both look axes — you can't yaw fast while pitching slow.
- Everything is **persistent**: send once, holds forever, so **always send the `idle` on release** (the prototype's `last.current` change-detection already does this — keep it).

### 4.2 Client-side techniques to hide latency

The model reacts at **chunk boundaries**, not per keypress. Hide that with client-side prediction and disciplined command emission.

1. **Emit on change only (coalesce).** Keep the prototype's pattern: track last-sent `{movement, h, v}` and only call the SDK when the *derived* state changes. Never spam identical commands.
2. **Rate-limit / debounce to chunk cadence.** Don't send faster than the model consumes. Use `chunk_complete` as a clock: buffer the *latest* desired state and flush at most once per chunk (a "last-write-wins" command queue). Rapid taps between chunks collapse to the final intent.
3. **Movement-axis arbitration.** Since movement is single-axis, choose **most-recent-key-wins** (LIFO) rather than fixed `W>S>A>D` priority, so a fresh strafe overrides stale forward — feels more responsive than the current static priority.
4. **Optimistic HUD / client-side prediction.** The HUD should react to *input*, not to video. Integrate a lightweight kinematic model client-side (heading, pseudo-altitude, speed, attitude indicator) at 60 Hz, eased/`Lerp`-smoothed (Unity `LateUpdate` lesson), so the artificial horizon, compass, and throttle bar move *instantly* even while the video catches up ~1 chunk later. Reconcile gently toward `state`/`chunk_complete` ground truth (active_action) to avoid drift.
5. **Look-speed tuning with expo + deadzone.** Apply Unity's deadzone (≈0.10–0.15) + expo (≈0.3) to stick input → `rotation_speed_deg`. Centre stick = precise slow pan; full deflection = fast snap. Expose a "sensitivity" + "expo" slider (FPV pilots expect this).
6. **Hold vs pulse.** Because commands are persistent: *hold* = set state once and leave it (cheap, no spam); *pulse/tap* = set then schedule an auto-`idle` after N chunks (good for "nudge" corrections). Offer both; default to hold for movement, pulse option for fine look.
7. **Keyboard + gamepad + virtual joystick** via one normalised intent bus. Use the Gamepad API (poll in `requestAnimationFrame`), normalise every source to `[-1,1]` per axis, run deadzone→expo, then derive discrete commands. Single code path = consistent feel.
8. **Auto-recenter (Angle-mode emulation).** Optional profile: on look-stick release, immediately send `idle` for look (already done) *and* visually snap HUD horizon level — emulates self-leveling without model support.
9. **Predictive "command in flight" affordance.** Show a subtle indicator that a command is queued for the next chunk (e.g. a chunk progress ring) so the operator understands the ~1-chunk lag instead of mashing inputs.

### 4.3 Connection / streaming tuning

Drive everything off `useStats()` (`rtt`, `framesPerSecond`, `packetLossRatio`, `jitter`, `candidateType`, `connectionTimings`).

| Lever | Recommendation | Source |
|---|---|---|
| **Jitter buffer** | Set `RTCRtpReceiver.jitterBufferTarget` low (start ~50–100 ms; never force `0` — causes stutter at high res). Tune against `packetLossRatio`/`jitter`. Video-only, so no A/V-sync penalty. | MDN; selkies; webrtcHacks |
| **Playout delay** | If sender supports the `playout-delay` RTP ext, request the *interactive streaming* profile (min≈max small, e.g. 0–100 ms). | WebRTC playout-delay docs |
| **Connect speed** | Keep `LingbotTracks` pre-declared (parallel SDP). Tune `maxAttempts` (default 6) against observed `connectionTimings.totalMs`. | js-sdk |
| **ICE/relay awareness** | Surface `candidateType`: a `relay` (TURN) path adds latency — warn operator / prefer direct. | js-sdk |
| **Stats-driven adaptation** | Build a **link-quality HUD** (green/amber/red) from `rtt`+`packetLossRatio`+`framesPerSecond`. If fps drops or loss spikes: (a) reduce input rate further, (b) lean more on client prediction, (c) lower `rotation_speed_deg` ceiling so quantisation errors are smaller. | — |
| **Reconnect** | Use SDK `reconnect()` with backoff on transport drop; preserve session intent (last prompt/seed/action) and re-arm on `ready`; show a "LINK LOST / RE-ACQUIRING" overlay (defence-grade signalling). | js-sdk |
| **Warm vs idle billing** | Keep `autoConnect:false` (idle = free). Add an explicit **"Arm / Spin-up GPU"** step so the operator knowingly enters the billed warm state; auto-disconnect after an idle timeout; show a session timer/cost meter. | prototype |

### 4.4 Prompt / scene strategy for believable UAV / defence worlds

The prompt is the world. `setPrompt` hot-swaps land on the next chunk — treat it as a **live scene-graph and event channel**.

- **Seed + base prompt** define the theatre: e.g. *"aerial drone view, midday, arid border terrain, dirt roads, sparse compounds, photoreal, FPV lens, slight barrel distortion."* Always include a **POV anchor** ("aerial drone view / FPV") so movement reads as flight, not walking.
- **Layered prompt template** = `BASE_SCENE + ALTITUDE/POV cue + TIME_OF_DAY + WEATHER + DYNAMIC_EVENTS`. Maintain these as composable slots (extend the existing `enhancePrompt` + `ATMOSPHERE_EVENTS`) so each HUD toggle edits *its* slot and re-emits the merged prompt.
- **Environment events** (mirroring AirSim `simSetWeather/Wind/TimeOfDay`): rain, dust/sandstorm, fog (low visibility), night/IR, dawn/dusk, high wind (visible via debris/sway). Pre-author defence-relevant presets.
- **Dynamic "targets"/threats** (MiroFish God's-eye injection): inject described entities — *"a convoy of three vehicles on the road below," "smoke rising from a compound," "a moving boat wake."* The model won't track objects across chunks, so **pair each injected entity with a client-side HUD marker** (operator-placed or scripted) for continuity.
- **Time-jump / scenario steps** for missions/training: scripted prompt timeline ("T+0 patrol → T+30 contact → T+60 exfil") fired on chunk ticks.
- **Stability tip:** change *one slot at a time* and keep wording consistent run-to-run (seed fixed) to minimise jarring scene morphs at chunk boundaries.

### 4.5 How the Laksh frontend should differ from the LingBot dashboard (high level)

Reframe the studio as a **ground control station (GCS)**. Keep the Reactor plumbing (`StudioProvider` lifecycle, `autoConnect:false`, image_accepted gating, clip recorder); replace the "creative studio" chrome with operator UX.

- **Full-bleed FPV feed** is king — video edge-to-edge, *nothing* over the centre (FPV-UX rule #1). Move all chrome to edges/corners.
- **Glanceable telemetry HUD overlay** (Unity OSD + DJI-app patterns): heading tape/compass, artificial horizon, pseudo-altitude, speed/throttle bar, MODE, mission clock — all client-predicted at 60 Hz, eased.
- **Link-quality + session status strip**: fps/rtt/loss from `useStats()`, chunk counter as a "frame clock," GPU-armed + cost timer.
- **Drone control input**: on-screen **dual virtual joysticks** (thumb-friendly, corners) + **gamepad** + keyboard; per-axis deadzone/expo/sensitivity settings; selectable **control profile** (Stabilised vs Manual).
- **Crosshair / reticle + target markers** layer over the feed; operator can drop markers that persist client-side and optionally inject a matching prompt entity.
- **Map / minimap** (synthetic): a top-down schematic of pseudo-position (dead-reckoned from commands) with AO boundary, markers, breadcrumb trail — pure client-side, since the model has no global map.
- **Mission framing**: AO/objective panel, scenario timeline, weather/time/threat "inject" controls (replace the playful atmosphere chips with a tactical event board), and a **Debrief mode** (clip review + telemetry timeline, MiroFish dual-mode pattern).
- **Critical-state alerts** are *interruptive* (link loss, GPU/session expiry, low "battery"/time budget) — unmissable, defence-grade.

> Implementation note: all of the above is **additive overlay + an intent→primitive compiler**; the underlying LingBot command set is unchanged. No code written yet — this is direction only.

---

## 5. Sources

- **Reactor SDK (local):** `@reactor-models/lingbot` core/react/README; `@reactor-team/js-sdk` `index.d.ts` (`ConnectionStats`, `ConnectOptions`, `useStats`).
- **Colosseum / AirSim:** `PythonClient/airsim/client.py`, `multirotor/{manual_mode_demo,orbit,set_wind,hello_drone}.py`, `docs/{apis,image_apis}.md` (NED frame, msgpack-rpc, RCData, drivetrain/YawMode, weather/wind/time APIs).
- **MiroFish:** README, `backend/app/api/report.py` (async task+poll), Vue3/Vite/d3 frontend; built on OASIS / CAMEL-AI.
- **Unity FPV Drone Simulator:** README + `Assets/Scripts/{DroneController,CameraController,OSDController}.cs` (PD/angle, acro rate, deadzone, expo, yaw damping, LateUpdate Lerp follow, OSD).
- **Web:** Real-time world models — minWM ([arxiv 2605.30263](https://arxiv.org/html/2605.30263)), Causal Forcing ([arxiv 2602.02214](https://arxiv.org/pdf/2602.02214)), MotionStream ([joonghyuk.com](https://joonghyuk.com/motionstream-web/)), WorldPlay ([arxiv 2512.14614](https://arxiv.org/html/2512.14614)), Self-Forcing tutorial ([Medium](https://medium.com/@aminfadaeinejad.edu/from-teacher-forcing-to-self-forcing-a-tutorial-on-autoregressive-video-generation-fb20b1ac72ad)) — AR distillation, rolling KV cache, progressive VAE decoding, ~0.4–1.3 s latency / 16–29 fps. WebRTC — [MDN `jitterBufferTarget`](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpReceiver/jitterBufferTarget), [WebRTC playout-delay](https://webrtc.googlesource.com/src/+/main/docs/native-code/rtp-hdrext/playout-delay/README.md), [selkies #157](https://github.com/selkies-project/selkies/issues/157), [webrtcHacks NetEQ](https://webrtchacks.com/how-webrtcs-neteq-jitter-buffer-provides-smooth-audio/). FPV UX — [VP0 drone HUD](https://vp0.com/blogs/dji-drone-controller-app-ui-template), [VP0 SwiftUI layout](https://vp0.com/blogs/drone-controller-ui-layout-swiftui), [dji-tello-sdk](https://github.com/ConceptCodes/dji-tello-sdk) (deadzone 0.1–0.15, 60 Hz, rc_limits), [Cal Bryant FPV guide](https://calbryant.uk/blog/a-comprehensive-guide-to-fpv-drone-technology/) (expo 0.2–0.7, throttle expo 0.3).
