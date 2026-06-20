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

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const lb = useLingbot();

  const firstSeed = LAKSH_SEEDS[0];
  const [scene, setScene] = useState<SceneGraph>(() => newSceneGraph(firstSeed.promptSeed));
  const [enhance, setEnhance] = useState(true);
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
  const [sensitivity, setSensitivityState] = useState(18);
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

  useEffect(() => { statusRef.current = lb.status; }, [lb.status]);
  useEffect(() => { lbRef.current = lb; }, [lb]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => { enhanceRef.current = enhance; }, [enhance]);

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

  // Re-emit the merged prompt mid-stream when a slot changes (one slot at a time).
  const emitPromptIfLive = useCallback(async (g: SceneGraph) => {
    if (stateRef.current?.started) {
      try {
        await lb.setPrompt({ prompt: composePrompt(g, enhanceRef.current) });
      } catch {
        // surfaced via command_error
      }
    }
  }, [lb]);

  // Push prompt changes live whenever the scene graph changes while running.
  useEffect(() => {
    if (stateRef.current?.started) {
      void emitPromptIfLive(scene);
    }
  }, [scene, emitPromptIfLive]);

  // ---- references ----
  const selectSeed = useCallback((seed: LakshSeed) => {
    setSelected({ kind: "preset", id: seed.id, label: seed.label, src: seed.src });
    setScene((g) => ({ ...g, base: seed.promptSeed }));
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
        await lb.setSeed({ seed: FIXED_SEED }).catch(() => {});
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
      const message = err instanceof Error ? err.message : "Generation failed.";
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
      setSessionSeconds(0);
      setLinkArmed(false);
    }
  }, [lb, pushLog]);

  const reset = useCallback(async () => {
    try {
      coalescerRef.current?.reset();
      flightRef.current.reset(0);
      setMarkers([]);
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
    if (nextScene) await emitPromptIfLive(nextScene);
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
    if (nextScene) await emitPromptIfLive(nextScene);
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
      composedPrompt, uploads, selected, selectSeed, selectUpload, addUpload,
      generate, stop, reset, togglePause, profile, sensitivity, setSensitivity,
      setVirtualMove, setVirtualLook, subscribeFlight, getFlight, markers,
      injectEvent, injectCustomTarget, dropWaypoint, clearMarkers, log, muted,
      hasVideo,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
