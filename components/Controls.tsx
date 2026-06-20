"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useStudio, type LookH, type LookV, type Movement } from "./StudioProvider";
import { ArrowKey } from "./icons";

// Physical keys we treat as held controls.
type CtrlKey = "w" | "a" | "s" | "d" | "up" | "down" | "left" | "right";

const KEY_MAP: Record<string, CtrlKey> = {
  w: "w",
  a: "a",
  s: "s",
  d: "d",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
};

function deriveMovement(keys: Set<CtrlKey>): Movement {
  // Single-axis movement; prioritize the most recently meaningful key.
  if (keys.has("w")) return "forward";
  if (keys.has("s")) return "back";
  if (keys.has("a")) return "strafe_left";
  if (keys.has("d")) return "strafe_right";
  return "idle";
}
function deriveLookH(keys: Set<CtrlKey>): LookH {
  if (keys.has("left")) return "left";
  if (keys.has("right")) return "right";
  return "idle";
}
function deriveLookV(keys: Set<CtrlKey>): LookV {
  if (keys.has("up")) return "up";
  if (keys.has("down")) return "down";
  return "idle";
}

export function Controls() {
  const { state, setMovement, setLookH, setLookV, rotationSpeed, setRotationSpeed } =
    useStudio();
  const enabled = Boolean(state?.started);

  const [keys, setKeys] = useState<Set<CtrlKey>>(new Set());
  const last = useRef({ movement: "idle" as Movement, h: "idle" as LookH, v: "idle" as LookV });

  const press = useCallback((k: CtrlKey) => {
    setKeys((prev) => {
      if (prev.has(k)) return prev;
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  }, []);
  const release = useCallback((k: CtrlKey) => {
    setKeys((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }, []);

  // Keyboard hold handling.
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k) return;
      release(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled, press, release]);

  // Push derived control state to the model only on change. When generation
  // isn't active we treat all keys as released so the model returns to idle.
  useEffect(() => {
    const active = enabled ? keys : EMPTY_KEYS;
    const m = deriveMovement(active);
    const h = deriveLookH(active);
    const v = deriveLookV(active);
    if (m !== last.current.movement) {
      last.current.movement = m;
      setMovement(m);
    }
    if (h !== last.current.h) {
      last.current.h = h;
      setLookH(h);
    }
    if (v !== last.current.v) {
      last.current.v = v;
      setLookV(v);
    }
  }, [keys, setMovement, setLookH, setLookV]);

  const bind = (k: CtrlKey) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      if (enabled) press(k);
    },
    onPointerUp: () => release(k),
    onPointerLeave: () => release(k),
    "data-active": keys.has(k),
    "data-disabled": !enabled,
  });

  return (
    <div className="flex items-center gap-10 rounded-[10px] border border-border bg-surface px-6 py-4">
      {/* Move */}
      <div className="flex flex-col items-center gap-2">
        <span className="label-mono self-start">Move</span>
        <div className="flex flex-col items-center gap-1.5">
          <button type="button" className="keycap" {...bind("w")}>
            W
          </button>
          <div className="flex gap-1.5">
            <button type="button" className="keycap" {...bind("a")}>
              A
            </button>
            <button type="button" className="keycap" {...bind("s")}>
              S
            </button>
            <button type="button" className="keycap" {...bind("d")}>
              D
            </button>
          </div>
        </div>
      </div>

      {/* Look */}
      <div className="flex flex-col items-center gap-2">
        <span className="label-mono self-start">Look</span>
        <div className="flex flex-col items-center gap-1.5">
          <button type="button" className="keycap" {...bind("up")}>
            <ArrowKey dir="up" />
          </button>
          <div className="flex gap-1.5">
            <button type="button" className="keycap" {...bind("left")}>
              <ArrowKey dir="left" />
            </button>
            <button type="button" className="keycap" {...bind("down")}>
              <ArrowKey dir="down" />
            </button>
            <button type="button" className="keycap" {...bind("right")}>
              <ArrowKey dir="right" />
            </button>
          </div>
        </div>
      </div>

      {/* Rotation speed */}
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label-mono">Rotation Speed</span>
          <span className="font-mono text-[11px] text-muted">
            {rotationSpeed.toFixed(0)}°/frame
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={rotationSpeed}
          onChange={(e) => setRotationSpeed(Number(e.target.value))}
          className="reactor-range w-full max-w-[280px]"
        />
      </div>
    </div>
  );
}
