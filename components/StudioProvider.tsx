"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useLingbot,
  useLingbotChunkComplete,
  useLingbotCommandError,
  useLingbotImageAccepted,
  useLingbotState,
  type LingbotStateMessage,
} from "@reactor-models/lingbot";

import {
  CommandCoalescer,
  compileIntent,
  DEFAULT_SENSITIVITY,
  DEFAULT_SHAPE,
  ZERO_INTENT,
  type ControlProfile,
  type DroneIntent,
  type LookH,
  type LookV,
  type Movement,
} from "@/lib/laksh/control";
import {
  FlightModel,
  INITIAL_FLIGHT,
  type FlightState,
} from "@/lib/laksh/flightModel";
import {
  composePrompt,
  newSceneGraph,
  type EventPreset,
  type SceneGraph,
} from "@/lib/laksh/scene";
import { LAKSH_SEEDS, type LakshSeed } from "@/lib/laksh/seeds";

export type { ControlProfile, LookH, LookV, Movement } from "@/lib/laksh/control";

export interface RefSelection {
  kind: "preset" | "upload";
  id: string;
  label: string;
  src: string;
}

export interface UploadItem {
  id: string;
  label: string;
  src: string;
  file: File;
}

export interface HudMarker {
  id: string;
  kind: EventPreset["kind"] | "waypoint";
  label: string;
  posX: number;
  posY: number;
  createdAt: number;
}

export interface MissionLogEntry {
  id: string;
  at: number;
  text: string;
  level: "info" | "warn" | "alert";
}

interface StudioContextValue {
  // status / lifecycle
  status: string;
  busy: boolean;
  busyLabel: string;
  state: LingbotStateMessage | null;
  error: string | null;
  clearError: () => void;
  sessionSeconds: number;
  /** True once a GPU link has been armed this session (for link-loss alerting). */
  linkArmed: boolean;

  // scene graph
  scene: SceneGraph;
  setPovSlot: (v: string) => void;
  setTimeSlot: (v: string) => void;
  setWeatherSlot: (v: string) => void;
  setBaseSlot: (v: string) => void;
  enhance: boolean;
  setEnhance: (v: boolean) => void;
  composedPrompt: string;
  /** Freeze live prompt re-emission during free-flight (world consistency). */
  worldLocked: boolean;
  setWorldLocked: (v: boolean) => void;

  // references / seeds
  seeds: LakshSeed[];
  uploads: UploadItem[];
  selected: RefSelection | null;
  selectSeed: (seed: LakshSeed) => void;
  selectUpload: (u: UploadItem) => void;
  addUpload: (file: File) => void;

  // lifecycle commands
  generate: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
  togglePause: () => Promise<void>;

  // control profile + sensitivity
  profile: ControlProfile;
  setProfile: (p: ControlProfile) => void;
  sensitivity: number;
  setSensitivity: (deg: number) => void;

  // intent bus (virtual joysticks publish here; keyboard/gamepad internal)
  setVirtualMove: (x: number, y: number) => void;
  setVirtualLook: (x: number, y: number) => void;
  intentRef: React.RefObject<DroneIntent>;

  // flight prediction (60Hz)
  subscribeFlight: (fn: (s: FlightState) => void) => () => void;
  getFlight: () => FlightState;

  // markers / targets
  markers: HudMarker[];
  injectEvent: (preset: EventPreset) => Promise<void>;
  injectCustomTarget: (label: string, promptText: string) => Promise<void>;
  dropWaypoint: () => void;
  clearMarkers: () => void;

  // mission log
  log: MissionLogEntry[];

  // media
  muted: boolean;
  setMuted: (v: boolean) => void;
  hasVideo: boolean;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within <StudioProvider>");
  return ctx;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const FIXED_SEED = 42; // reproducible runs (playbook §4.4 stability)

/**
 * Map raw Reactor connect/session errors to operator-friendly copy. The live
 * platform returns HTTP 429 `quota_exceeded` once all 5 concurrent sessions are
 * in use (confirmed via scripts/stress/concurrency.py) and 402 when out of
 * credits — both should read as actionable status, not a stack-trace string.
 */
function friendlyConnectError(raw: string): string {
  if (/\b429\b/.test(raw) || /quota_exceeded|concurrent_sessions/i.test(raw)) {
    return "All GPU sessions are in use (limit 5). Wait a moment and re-arm the feed.";
  }
  if (/\b402\b/.test(raw) || /out of credits|insufficient/i.test(raw)) {
    return "GPU credits exhausted — top up the Reactor account to continue.";
  }
  if (/\b401\b/.test(raw) || /AUTHENTICATION_FAILED|token/i.test(raw)) {
    return "Session token rejected — check the Reactor API key, then re-arm.";
  }
  return raw;
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const lb = useLingbot();

  const firstSeed = LAKSH_SEEDS[0];
  const [scene, setScene] = useState<SceneGraph>(() => {
    const g = newSceneGraph(firstSeed.promptSeed);
    return firstSeed.pov ? { ...g, pov: firstSeed.pov } : g;
  });
  const [enhance, setEnhance] = useState(true);
  const [worldLocked, setWorldLockedState] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selected, setSelected] = useState<RefSelection | null>({
    kind: "preset",
    id: firstSeed.id,
    label: firstSeed.label,
    src: firstSeed.src,
  });
  const [state, setState] = useState<LingbotStateMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [muted, setMuted] = useState(true);
  const [sensitivity, setSensitivityState] = useState(DEFAULT_SENSITIVITY);
  const [profile, setProfile] = useState<ControlProfile>("stabilised");
  const [markers, setMarkers] = useState<HudMarker[]>([]);
  const [log, setLog] = useState<MissionLogEntry[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [linkArmed, setLinkArmed] = useState(false);

  // Live mirrors so async flows + the rAF loop read freshest values.
  const statusRef = useRef(lb.status);
  const lbRef = useRef(lb);
  const stateRef = useRef<LingbotStateMessage | null>(null);
  const imageAcceptedRef = useRef(false);
  const fileCacheRef = useRef<Map<string, File>>(new Map());
  const enabledRef = useRef(false);
  const profileRef = useRef(profile);
  const sensitivityRef = useRef(sensitivity);
  const sceneRef = useRef(scene);
  const enhanceRef = useRef(enhance);
  // World-consistency refs: dedup identical prompts, debounce rapid slot edits,
  // and freeze prompt re-emission when the world is locked.
  const lastSentPromptRef = useRef("");
  const promptDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const worldLockedRef = useRef(worldLocked);

  useEffect(() => { statusRef.current = lb.status; }, [lb.status]);
  useEffect(() => { lbRef.current = lb; }, [lb]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => { enhanceRef.current = enhance; }, [enhance]);
  useEffect(() => { worldLockedRef.current = worldLocked; }, [worldLocked]);

  const pushLog = useCallback((text: string, level: MissionLogEntry["level"] = "info") => {
    setLog((prev) =>
      [{ id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), text, level }, ...prev].slice(0, 40),
    );
  }, []);

  // ---- intent bus refs (combined from keyboard + gamepad + virtual sticks) ----
  const keysRef = useRef<Set<string>>(new Set());
  const vMove = useRef({ x: 0, y: 0 });
  const vLook = useRef({ x: 0, y: 0 });
  const intentRef = useRef<DroneIntent>({ ...ZERO_INTENT });
  const recentAxisRef = useRef<"throttle" | "strafe">("throttle");

  // ---- flight model + subscribers ----
  const flightRef = useRef<FlightModel>(new FlightModel());
  const flightSnapRef = useRef<FlightState>({ ...INITIAL_FLIGHT });
  const flightListeners = useRef<Set<(s: FlightState) => void>>(new Set());

  // ---- command coalescer (created once on mount; sinks read live via refs) ----
  const coalescerRef = useRef<CommandCoalescer | null>(null);
  useEffect(() => {
    coalescerRef.current = new CommandCoalescer({
      setMovement: (m: Movement) => {
        if (statusRef.current === "ready") lbRef.current.setMovement({ movement: m }).catch(() => {});
      },
      setLookH: (l: LookH) => {
        if (statusRef.current === "ready") lbRef.current.setLookHorizontal({ look_horizontal: l }).catch(() => {});
      },
      setLookV: (l: LookV) => {
        if (statusRef.current === "ready") lbRef.current.setLookVertical({ look_vertical: l }).catch(() => {});
      },
      setRotationSpeedDeg: (deg: number) => {
        if (statusRef.current === "ready") lbRef.current.setRotationSpeedDeg({ rotation_speed_deg: deg }).catch(() => {});
      },
    });
  }, []);

  // ---- model messages ----
  useLingbotState((msg) => {
    setState(msg);
    stateRef.current = msg;
    enabledRef.current = Boolean(msg.started);
  });

  useLingbotImageAccepted(() => {
    imageAcceptedRef.current = true;
  });

  useLingbotCommandError((msg) => {
    setError(`${msg.command}: ${msg.reason}`);
  });

  const lastChunkAtRef = useRef(0);
  useLingbotChunkComplete((msg) => {
    // Chunk boundary is the control cadence: flush the buffered desired state.
    const now = performance.now();
    const dt = lastChunkAtRef.current ? (now - lastChunkAtRef.current) / 1000 : 0;
    lastChunkAtRef.current = now;
    if (enabledRef.current) coalescerRef.current?.flush();
    flightRef.current.reconcile(msg.active_action, dt);
  });

  const clearError = useCallback(() => setError(null), []);

  // ---- 60Hz intent + prediction loop ----
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();

    const readKeyboardLook = () => {
      const k = keysRef.current;
      let yaw = 0;
      let pitch = 0;
      if (k.has("left")) yaw -= 1;
      if (k.has("right")) yaw += 1;
      if (k.has("up")) pitch += 1;
      if (k.has("down")) pitch -= 1;
      return { yaw, pitch };
    };
    const readKeyboardMove = () => {
      const k = keysRef.current;
      let throttle = 0;
      let strafe = 0;
      if (k.has("w")) throttle += 1;
      if (k.has("s")) throttle -= 1;
      if (k.has("d")) strafe += 1;
      if (k.has("a")) strafe -= 1;
      return { throttle, strafe };
    };
    const readGamepad = () => {
      const out = { throttle: 0, strafe: 0, yaw: 0, pitch: 0 };
      if (typeof navigator === "undefined" || !navigator.getGamepads) return out;
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (!pad) continue;
        const a = pad.axes;
        // Standard mapping: left stick (0=X, 1=Y), right stick (2=X, 3=Y).
        if (a.length >= 2) {
          out.strafe += a[0] ?? 0;
          out.throttle += -(a[1] ?? 0); // up = forward
        }
        if (a.length >= 4) {
          out.yaw += a[2] ?? 0;
          out.pitch += -(a[3] ?? 0); // up = look up
        }
        break; // first connected pad only
      }
      return out;
    };

    const tick = () => {
      const now = performance.now();
      const dt = (now - prev) / 1000;
      prev = now;

      const enabled = enabledRef.current;

      const kbM = readKeyboardMove();
      const kbL = readKeyboardLook();
      const gp = readGamepad();

      let throttle = clamp(kbM.throttle + gp.throttle + vMove.current.y, -1, 1);
      let strafe = clamp(kbM.strafe + gp.strafe + vMove.current.x, -1, 1);
      let yaw = clamp(kbL.yaw + gp.yaw + vLook.current.x, -1, 1);
      let pitch = clamp(kbL.pitch + gp.pitch + vLook.current.y, -1, 1);

      if (!enabled) {
        throttle = 0; strafe = 0; yaw = 0; pitch = 0;
      }

      // Track most-recent movement axis for LIFO arbitration.
      const prevIntent = intentRef.current;
      if (Math.abs(throttle) > DEFAULT_SHAPE.deadzone && Math.abs(prevIntent.throttle) <= DEFAULT_SHAPE.deadzone) {
        recentAxisRef.current = "throttle";
      } else if (Math.abs(strafe) > DEFAULT_SHAPE.deadzone && Math.abs(prevIntent.strafe) <= DEFAULT_SHAPE.deadzone) {
        recentAxisRef.current = "strafe";
      }

      const intent: DroneIntent = {
        throttle,
        strafe,
        yaw,
        pitch,
        recentAxis: recentAxisRef.current,
      };
      intentRef.current = intent;

      // Prediction.
      const snap = flightRef.current.step(
        intent,
        dt,
        profileRef.current,
        sensitivityRef.current / 30,
      );
      flightSnapRef.current = snap;
      flightListeners.current.forEach((fn) => fn(snap));

      // Compile → coalesce (flush happens on chunk boundary + idle-release).
      if (enabled) {
        const primitives = compileIntent(intent, {
          shape: DEFAULT_SHAPE,
          sensitivity: sensitivityRef.current,
          profile: profileRef.current,
        });
        coalescerRef.current?.setDesired(primitives);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard listeners (held controls).
  useEffect(() => {
    const KEY_MAP: Record<string, string> = {
      w: "w", a: "a", s: "s", d: "d",
      arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
    };
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      keysRef.current.add(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k) return;
      keysRef.current.delete(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Session timer + cost awareness. Only mutates state inside the async interval
  // callback (never synchronously in the effect body); resets happen in the
  // generate/stop handlers.
  useEffect(() => {
    if (!state?.started) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [state?.started]);

  // ---- intent bus publishers ----
  const setVirtualMove = useCallback((x: number, y: number) => {
    vMove.current = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }, []);
  const setVirtualLook = useCallback((x: number, y: number) => {
    vLook.current = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }, []);

  const subscribeFlight = useCallback((fn: (s: FlightState) => void) => {
    flightListeners.current.add(fn);
    fn(flightSnapRef.current);
    return () => {
      flightListeners.current.delete(fn);
    };
  }, []);
  const getFlight = useCallback(() => flightSnapRef.current, []);

  // ---- scene-graph setters ----
  const setPovSlot = useCallback((v: string) => setScene((g) => ({ ...g, pov: v })), []);
  const setTimeSlot = useCallback((v: string) => setScene((g) => ({ ...g, timeOfDay: v })), []);
  const setWeatherSlot = useCallback((v: string) => setScene((g) => ({ ...g, weather: v })), []);
  const setBaseSlot = useCallback((v: string) => setScene((g) => ({ ...g, base: v })), []);

  const composedPrompt = useMemo(() => composePrompt(scene, enhance), [scene, enhance]);

  // Re-emit the merged prompt mid-stream when a slot MEANINGFULLY changes.
  //
  // World-consistency discipline (docs/research/world-consistency.md):
  //  - dedup: never re-send a prompt identical to the last one on the wire
  //    (toggling a chip back, re-renders, double-paths all collapse to no-op);
  //  - debounce: coalesce rapid edits (e.g. typing in the base textarea fires
  //    on every keystroke) into a single setPrompt so the world isn't churned
  //    char-by-char at chunk boundaries;
  //  - lock: while the world is locked, freeze prompt re-emission entirely so
  //    free-flight never triggers a prompt-driven morph.
  // Each of these directly reduces the prompt churn that makes LingBot morph.
  const PROMPT_DEBOUNCE_MS = 350;

  const flushPrompt = useCallback((g: SceneGraph) => {
    const next = composePrompt(g, enhanceRef.current);
    if (next === lastSentPromptRef.current) return;
    lastSentPromptRef.current = next;
    lb.setPrompt({ prompt: next }).catch(() => {
      // surfaced via command_error
    });
  }, [lb]);

  const emitPromptIfLive = useCallback((g: SceneGraph, immediate = false) => {
    if (!stateRef.current?.started) return;
    if (worldLockedRef.current) return; // world frozen — no prompt churn
    if (composePrompt(g, enhanceRef.current) === lastSentPromptRef.current) return;
    if (promptDebounceRef.current) {
      clearTimeout(promptDebounceRef.current);
      promptDebounceRef.current = null;
    }
    if (immediate) {
      flushPrompt(g);
    } else {
      promptDebounceRef.current = setTimeout(() => {
        promptDebounceRef.current = null;
        flushPrompt(sceneRef.current);
      }, PROMPT_DEBOUNCE_MS);
    }
  }, [flushPrompt]);

  // Push prompt changes live whenever the scene graph changes while running.
  useEffect(() => {
    emitPromptIfLive(scene);
  }, [scene, emitPromptIfLive]);

  // Lock toggle: when UNLOCKING mid-flight, flush any pending scene edits so the
  // world catches up to the composed prompt; locking just freezes re-emission.
  const setWorldLocked = useCallback((v: boolean) => {
    setWorldLockedState(v);
    worldLockedRef.current = v;
    if (!v) emitPromptIfLive(sceneRef.current, true);
    if (v) pushLog("World locked — prompt frozen for stable free-flight.", "info");
    else pushLog("World unlocked — scene-graph edits live again.", "info");
  }, [emitPromptIfLive, pushLog]);

  // ---- references ----
  const selectSeed = useCallback((seed: LakshSeed) => {
    setSelected({ kind: "preset", id: seed.id, label: seed.label, src: seed.src });
    setScene((g) => ({ ...g, base: seed.promptSeed, pov: seed.pov ?? g.pov }));
  }, []);

  const selectUpload = useCallback((u: UploadItem) => {
    setSelected({ kind: "upload", id: u.id, label: u.label, src: u.src });
  }, []);

  const addUpload = useCallback((file: File) => {
    const id = `upload-${Date.now()}`;
    const src = URL.createObjectURL(file);
    fileCacheRef.current.set(id, file);
    const item: UploadItem = { id, label: file.name, src, file };
    setUploads((prev) => [item, ...prev].slice(0, 8));
    setSelected({ kind: "upload", id, label: file.name, src });
  }, []);

  const resolveFile = useCallback(async (sel: RefSelection): Promise<File> => {
    if (sel.kind === "upload") {
      const cached = fileCacheRef.current.get(sel.id);
      if (cached) return cached;
    }
    const cached = fileCacheRef.current.get(sel.src);
    if (cached) return cached;
    const res = await fetch(sel.src);
    const blob = await res.blob();
    const file = new File([blob], `${sel.id}.jpg`, { type: blob.type || "image/jpeg" });
    fileCacheRef.current.set(sel.src, file);
    return file;
  }, []);

  const waitForStatus = useCallback(async (target: string, timeoutMs = 30000) => {
    const start = Date.now();
    while (statusRef.current !== target) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for "${target}" (still ${statusRef.current}).`);
      }
      await wait(150);
    }
  }, []);

  const setSensitivity = useCallback((deg: number) => {
    setSensitivityState(deg);
    if (statusRef.current === "ready") lb.setRotationSpeedDeg({ rotation_speed_deg: deg }).catch(() => {});
  }, [lb]);

  // ---- lifecycle: connect → uploadFile → setImage → image_accepted → setPrompt → start ----
  const generate = useCallback(async () => {
    if (busy) return;
    const sel = selected;
    if (!sel) {
      setError("Select a mission seed image first.");
      return;
    }
    const g = sceneRef.current;
    const finalPrompt = composePrompt(g, enhanceRef.current);
    if (!finalPrompt.trim()) {
      setError("Compose a scene prompt first.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      if (stateRef.current?.started) {
        setBusyLabel("Updating theatre…");
        lastSentPromptRef.current = finalPrompt;
        await lb.setPrompt({ prompt: finalPrompt });
        pushLog("Scene-graph re-tasked live.", "info");
      } else {
        if (statusRef.current !== "ready") {
          setBusyLabel("Arming GPU link…");
          await lb.connect();
          await waitForStatus("ready");
          setLinkArmed(true);
          pushLog("GPU link established — session armed (billing live).", "warn");
        }

        setBusyLabel("Uploading seed frame…");
        const file = await resolveFile(sel);
        const ref = await lb.uploadFile(file);
        imageAcceptedRef.current = false;
        await lb.setImage({ image: ref });

        // Wait for the model to decode the image before start (first-chunk race).
        const decodeStart = Date.now();
        while (!imageAcceptedRef.current) {
          if (Date.now() - decodeStart > 15000) break;
          await wait(120);
        }

        setBusyLabel("Loading scene-graph…");
        // Fixed seed BEFORE prompt/start anchors a reproducible world (read once
        // at start); the prompt anchor + fixed seed are the consistency baseline.
        await lb.setSeed({ seed: FIXED_SEED }).catch(() => {});
        lastSentPromptRef.current = finalPrompt;
        await lb.setPrompt({ prompt: finalPrompt });
        await lb.setRotationSpeedDeg({ rotation_speed_deg: sensitivityRef.current }).catch(() => {});

        setBusyLabel("Launching feed…");
        flightRef.current.reset(0);
        coalescerRef.current?.reset();
        setSessionSeconds(0);
        await lb.start();
        pushLog(`Feed live — theatre: ${sel.label}.`, "info");
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Generation failed.";
      const message = friendlyConnectError(raw);
      setError(message);
      pushLog(message, "alert");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [busy, selected, lb, resolveFile, waitForStatus, pushLog]);

  const stop = useCallback(async () => {
    try {
      coalescerRef.current?.reset();
      if (stateRef.current?.started) await lb.reset().catch(() => {});
      await lb.disconnect();
      pushLog("Session terminated — GPU released, billing stopped.", "warn");
    } catch {
      // best-effort
    } finally {
      setState(null);
      stateRef.current = null;
      enabledRef.current = false;
      lastSentPromptRef.current = "";
      setSessionSeconds(0);
      setLinkArmed(false);
    }
  }, [lb, pushLog]);

  const reset = useCallback(async () => {
    try {
      coalescerRef.current?.reset();
      flightRef.current.reset(0);
      setMarkers([]);
      lastSentPromptRef.current = "";
      await lb.reset();
      pushLog("World reset — re-acquiring.", "warn");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    }
  }, [lb, pushLog]);

  const togglePause = useCallback(async () => {
    try {
      if (stateRef.current?.paused) await lb.resume();
      else await lb.pause();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pause/resume failed.");
    }
  }, [lb]);

  // ---- markers / target injection ----
  const placeMarker = useCallback((kind: HudMarker["kind"], label: string) => {
    const f = flightSnapRef.current;
    const rad = (f.heading * Math.PI) / 180;
    const range = 140 + Math.random() * 220; // metres ahead
    const spread = (Math.random() - 0.5) * 140; // lateral scatter
    const posX = f.posX + Math.sin(rad) * range + Math.cos(rad) * spread;
    const posY = f.posY + Math.cos(rad) * range - Math.sin(rad) * spread;
    const marker: HudMarker = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      label,
      posX,
      posY,
      createdAt: Date.now(),
    };
    setMarkers((prev) => [...prev, marker].slice(-24));
  }, []);

  const injectEvent = useCallback(async (preset: EventPreset) => {
    let nextScene: SceneGraph | null = null;
    setScene((g) => {
      nextScene = { ...g, events: [...g.events, preset.value].slice(-4) };
      return nextScene;
    });
    placeMarker(preset.kind, preset.label);
    pushLog(`Injected: ${preset.label}.`, "warn");
    if (nextScene) emitPromptIfLive(nextScene, true);
  }, [placeMarker, pushLog, emitPromptIfLive]);

  const injectCustomTarget = useCallback(async (label: string, promptText: string) => {
    const text = promptText.trim();
    if (!text) return;
    let nextScene: SceneGraph | null = null;
    setScene((g) => {
      nextScene = { ...g, events: [...g.events, text].slice(-4) };
      return nextScene;
    });
    placeMarker("structure", label || "Target");
    pushLog(`Injected target: ${label || text.slice(0, 24)}.`, "warn");
    if (nextScene) emitPromptIfLive(nextScene, true);
  }, [placeMarker, pushLog, emitPromptIfLive]);

  const dropWaypoint = useCallback(() => {
    placeMarker("waypoint", `WP-${markers.length + 1}`);
    pushLog("Waypoint dropped.", "info");
  }, [placeMarker, markers.length, pushLog]);

  const clearMarkers = useCallback(() => {
    setMarkers([]);
    setScene((g) => ({ ...g, events: [] }));
  }, []);

  const hasVideo = Boolean(lb.tracks?.main_video);

  const value = useMemo<StudioContextValue>(
    () => ({
      status: lb.status,
      busy,
      busyLabel,
      state,
      error,
      clearError,
      sessionSeconds,
      linkArmed,
      scene,
      setPovSlot,
      setTimeSlot,
      setWeatherSlot,
      setBaseSlot,
      enhance,
      setEnhance,
      composedPrompt,
      worldLocked,
      setWorldLocked,
      seeds: LAKSH_SEEDS,
      uploads,
      selected,
      selectSeed,
      selectUpload,
      addUpload,
      generate,
      stop,
      reset,
      togglePause,
      profile,
      setProfile,
      sensitivity,
      setSensitivity,
      setVirtualMove,
      setVirtualLook,
      intentRef,
      subscribeFlight,
      getFlight,
      markers,
      injectEvent,
      injectCustomTarget,
      dropWaypoint,
      clearMarkers,
      log,
      muted,
      setMuted,
      hasVideo,
    }),
    [
      lb.status, busy, busyLabel, state, error, clearError, sessionSeconds, linkArmed,
      scene, setPovSlot, setTimeSlot, setWeatherSlot, setBaseSlot, enhance,
      worldLocked, setWorldLocked,
      composedPrompt, uploads, selected, selectSeed, selectUpload, addUpload,
      generate, stop, reset, togglePause, profile, sensitivity, setSensitivity,
      setVirtualMove, setVirtualLook, subscribeFlight, getFlight, markers,
      injectEvent, injectCustomTarget, dropWaypoint, clearMarkers, log, muted,
      hasVideo,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
