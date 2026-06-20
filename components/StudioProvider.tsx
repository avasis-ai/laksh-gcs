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
  useLingbotCommandError,
  useLingbotImageAccepted,
  useLingbotState,
  type LingbotStateMessage,
} from "@reactor-models/lingbot";

import {
  REFERENCE_SCENES,
  enhancePrompt,
  type ReferenceScene,
} from "@/lib/scenes";

export type Movement = "idle" | "forward" | "back" | "strafe_left" | "strafe_right";
export type LookH = "idle" | "left" | "right";
export type LookV = "idle" | "up" | "down";

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

export interface HistoryItem {
  id: string;
  prompt: string;
  thumb: string;
  refId: string;
  at: number;
}

interface StudioContextValue {
  // status
  status: string;
  busy: boolean;
  busyLabel: string;
  state: LingbotStateMessage | null;
  error: string | null;
  clearError: () => void;

  // composer
  prompt: string;
  setPrompt: (p: string) => void;
  enhance: boolean;
  setEnhance: (v: boolean) => void;

  // references
  scenes: ReferenceScene[];
  uploads: UploadItem[];
  selected: RefSelection | null;
  selectScene: (scene: ReferenceScene) => void;
  selectUpload: (u: UploadItem) => void;
  addUpload: (file: File) => void;

  // history
  history: HistoryItem[];
  rerun: (item: HistoryItem) => void;

  // lifecycle
  generate: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
  togglePause: () => Promise<void>;

  // live controls
  setMovement: (m: Movement) => void;
  setLookH: (l: LookH) => void;
  setLookV: (l: LookV) => void;
  rotationSpeed: number;
  setRotationSpeed: (deg: number) => void;
  applyAtmosphere: (suffix: string) => Promise<void>;

  // media
  muted: boolean;
  setMuted: (v: boolean) => void;

  // tracks (for empty-state detection)
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

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const lb = useLingbot();

  const firstScene = REFERENCE_SCENES[0];
  const [prompt, setPrompt] = useState(firstScene.prompt);
  const [enhance, setEnhance] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selected, setSelected] = useState<RefSelection | null>({
    kind: "preset",
    id: firstScene.id,
    label: firstScene.label,
    src: firstScene.src,
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [state, setState] = useState<LingbotStateMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [muted, setMuted] = useState(true);
  const [rotationSpeed, setRotationSpeedState] = useState(5);

  // Live mirrors so async flows can read the freshest values.
  const statusRef = useRef(lb.status);
  const stateRef = useRef<LingbotStateMessage | null>(null);
  const imageAcceptedRef = useRef(false);
  const fileCacheRef = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    statusRef.current = lb.status;
  }, [lb.status]);

  useLingbotState((msg) => {
    setState(msg);
    stateRef.current = msg;
  });

  useLingbotImageAccepted(() => {
    imageAcceptedRef.current = true;
  });

  useLingbotCommandError((msg) => {
    setError(`${msg.command}: ${msg.reason}`);
  });

  const clearError = useCallback(() => setError(null), []);

  const selectScene = useCallback((scene: ReferenceScene) => {
    setSelected({ kind: "preset", id: scene.id, label: scene.label, src: scene.src });
    setPrompt((cur) => (cur.trim() ? cur : scene.prompt));
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

  // Resolve the selected reference into an uploadable File.
  const resolveFile = useCallback(async (sel: RefSelection): Promise<File> => {
    if (sel.kind === "upload") {
      const cached = fileCacheRef.current.get(sel.id);
      if (cached) return cached;
    }
    const cached = fileCacheRef.current.get(sel.src);
    if (cached) return cached;
    const res = await fetch(sel.src);
    const blob = await res.blob();
    const file = new File([blob], `${sel.id}.jpg`, {
      type: blob.type || "image/jpeg",
    });
    fileCacheRef.current.set(sel.src, file);
    return file;
  }, []);

  const waitForStatus = useCallback(
    async (target: string, timeoutMs = 30000) => {
      const start = Date.now();
      while (statusRef.current !== target) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(`Timed out waiting for "${target}" (still ${statusRef.current}).`);
        }
        await wait(150);
      }
    },
    [],
  );

  const generate = useCallback(async () => {
    if (busy) return;
    const sel = selected;
    if (!sel) {
      setError("Pick a reference image first.");
      return;
    }
    const raw = prompt.trim();
    if (!raw) {
      setError("Describe the scene you want to generate.");
      return;
    }
    const finalPrompt = enhance ? enhancePrompt(raw) : raw;

    setError(null);
    setBusy(true);
    try {
      // If already running, treat Generate as a live re-prompt + reseed.
      if (stateRef.current?.started) {
        setBusyLabel("Updating scene…");
        await lb.setPrompt({ prompt: finalPrompt });
      } else {
        if (statusRef.current !== "ready") {
          setBusyLabel("Connecting to GPU…");
          await lb.connect();
          await waitForStatus("ready");
        }

        setBusyLabel("Uploading seed image…");
        const file = await resolveFile(sel);
        const ref = await lb.uploadFile(file);
        imageAcceptedRef.current = false;
        await lb.setImage({ image: ref });

        // Wait for the model to decode the image before starting to avoid
        // the documented first-chunk race.
        const decodeStart = Date.now();
        while (!imageAcceptedRef.current) {
          if (Date.now() - decodeStart > 15000) break;
          await wait(120);
        }

        setBusyLabel("Arming prompt…");
        await lb.setPrompt({ prompt: finalPrompt });

        setBusyLabel("Starting generation…");
        await lb.start();
      }

      setHistory((prev) =>
        [
          {
            id: `h-${Date.now()}`,
            prompt: raw,
            thumb: sel.src,
            refId: sel.id,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, 12),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      setError(message);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [busy, selected, prompt, enhance, lb, resolveFile, waitForStatus]);

  const stop = useCallback(async () => {
    try {
      if (stateRef.current?.started) {
        await lb.reset().catch(() => {});
      }
      await lb.disconnect();
    } catch {
      // ignore — disconnect is best-effort
    } finally {
      setState(null);
      stateRef.current = null;
    }
  }, [lb]);

  const reset = useCallback(async () => {
    try {
      await lb.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    }
  }, [lb]);

  const togglePause = useCallback(async () => {
    try {
      if (stateRef.current?.paused) await lb.resume();
      else await lb.pause();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pause/resume failed.");
    }
  }, [lb]);

  const setMovement = useCallback(
    (m: Movement) => {
      if (statusRef.current === "ready") lb.setMovement({ movement: m }).catch(() => {});
    },
    [lb],
  );
  const setLookH = useCallback(
    (l: LookH) => {
      if (statusRef.current === "ready") lb.setLookHorizontal({ look_horizontal: l }).catch(() => {});
    },
    [lb],
  );
  const setLookV = useCallback(
    (l: LookV) => {
      if (statusRef.current === "ready") lb.setLookVertical({ look_vertical: l }).catch(() => {});
    },
    [lb],
  );

  const setRotationSpeed = useCallback(
    (deg: number) => {
      setRotationSpeedState(deg);
      if (statusRef.current === "ready")
        lb.setRotationSpeedDeg({ rotation_speed_deg: deg }).catch(() => {});
    },
    [lb],
  );

  const applyAtmosphere = useCallback(
    async (suffix: string) => {
      const base = prompt.trim();
      const next = `${base} ${suffix}`.trim();
      setPrompt(next);
      if (stateRef.current?.started) {
        try {
          await lb.setPrompt({ prompt: enhance ? enhancePrompt(next) : next });
        } catch {
          // ignore
        }
      }
    },
    [prompt, enhance, lb],
  );

  const rerun = useCallback(
    (item: HistoryItem) => {
      setPrompt(item.prompt);
      const scene = REFERENCE_SCENES.find((s) => s.id === item.refId);
      if (scene) {
        setSelected({ kind: "preset", id: scene.id, label: scene.label, src: scene.src });
      } else {
        const up = uploads.find((u) => u.id === item.refId);
        if (up) setSelected({ kind: "upload", id: up.id, label: up.label, src: up.src });
      }
    },
    [uploads],
  );

  const hasVideo = Boolean(lb.tracks?.main_video);

  const value = useMemo<StudioContextValue>(
    () => ({
      status: lb.status,
      busy,
      busyLabel,
      state,
      error,
      clearError,
      prompt,
      setPrompt,
      enhance,
      setEnhance,
      scenes: REFERENCE_SCENES,
      uploads,
      selected,
      selectScene,
      selectUpload,
      addUpload,
      history,
      rerun,
      generate,
      stop,
      reset,
      togglePause,
      setMovement,
      setLookH,
      setLookV,
      rotationSpeed,
      setRotationSpeed,
      applyAtmosphere,
      muted,
      setMuted,
      hasVideo,
    }),
    [
      lb.status,
      busy,
      busyLabel,
      state,
      error,
      clearError,
      prompt,
      enhance,
      uploads,
      selected,
      selectScene,
      selectUpload,
      addUpload,
      history,
      rerun,
      generate,
      stop,
      reset,
      togglePause,
      setMovement,
      setLookH,
      setLookV,
      rotationSpeed,
      setRotationSpeed,
      applyAtmosphere,
      muted,
      hasVideo,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
