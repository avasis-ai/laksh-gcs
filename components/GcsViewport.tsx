"use client";

import { useEffect, useState } from "react";

import { LingbotMainVideoView, useLingbot } from "@reactor-models/lingbot";

import { useStudio } from "./StudioProvider";
import { Alerts } from "./hud/Alerts";
import { ArtificialHorizon, CompassRibbon, Reticle, TelemetryStrip } from "./hud/Instruments";
import { LinkQuality } from "./hud/LinkQuality";
import { Minimap } from "./hud/Minimap";
import { VirtualJoysticks } from "./VirtualJoysticks";
import {
  ChevronDown,
  Crosshair,
  Download,
  Gamepad,
  LakshMark,
  MapPin,
  MuteToggle,
  Pause,
  Play,
  Power,
  Refresh,
  Scissors,
  Spinner,
} from "./icons";

function statusMeta(status: string, running: boolean, paused: boolean) {
  if (paused) return { label: "PAUSED", color: "var(--caution)" };
  if (running) return { label: "LIVE", color: "var(--good)" };
  switch (status) {
    case "ready":
      return { label: "ARMED", color: "var(--ready)" };
    case "connecting":
      return { label: "CONNECTING", color: "var(--ready)" };
    case "waiting":
      return { label: "TASKING GPU", color: "var(--ready)" };
    default:
      return { label: "OFFLINE", color: "var(--faint)" };
  }
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-md border text-muted transition-colors hover:border-border-strong hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: active ? "var(--accent-active)" : "var(--border)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function ClipMenu() {
  const lb = useLingbot();
  const { setMuted, muted } = useStudio();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const ready = lb.status === "ready";

  async function grab(kind: "10" | "30" | "full") {
    setOpen(false);
    setWorking(kind);
    try {
      const clip = kind === "full" ? await lb.requestRecording() : await lb.requestClip(Number(kind));
      await lb.downloadClipAsFile(clip, `laksh-${kind}-${Date.now()}.mp4`);
    } catch {
      // surfaced elsewhere
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        disabled={!ready || working !== null}
        onClick={() => grab("10")}
        className="flex h-7 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-surface px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {working ? <Spinner className="spin" /> : <Scissors className="text-muted" />}
        Clip
      </button>
      <button
        type="button"
        disabled={!ready || working !== null}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center rounded-r-md border border-border bg-surface px-1.5 text-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Clip options"
      >
        <ChevronDown />
      </button>
      {open && (
        <div className="absolute bottom-9 right-0 z-40 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
          {[
            { k: "10" as const, l: "Last 10 seconds" },
            { k: "30" as const, l: "Last 30 seconds" },
            { k: "full" as const, l: "Full recording" },
          ].map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => grab(o.k)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-surface-muted"
            >
              <Download className="text-muted" />
              {o.l}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setMuted(!muted);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-surface-muted"
          >
            <MuteToggle muted={muted} className="text-muted" />
            {muted ? "Unmute audio" : "Mute audio"}
          </button>
        </div>
      )}
    </div>
  );
}

function useGamepadPresence() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => {
      const pads = navigator.getGamepads?.() ?? [];
      setConnected(Array.from(pads).some(Boolean));
    };
    window.addEventListener("gamepadconnected", on);
    window.addEventListener("gamepaddisconnected", off);
    off();
    return () => {
      window.removeEventListener("gamepadconnected", on);
      window.removeEventListener("gamepaddisconnected", off);
    };
  }, []);
  return connected;
}

export function GcsViewport() {
  const {
    status,
    state,
    busy,
    busyLabel,
    hasVideo,
    muted,
    setMuted,
    stop,
    reset,
    togglePause,
    profile,
    setProfile,
    sensitivity,
    setSensitivity,
    dropWaypoint,
  } = useStudio();

  const running = Boolean(state?.running);
  const started = Boolean(state?.started);
  const paused = Boolean(state?.paused);
  const meta = statusMeta(status, running, paused);
  const showVideo = hasVideo && started;
  const gamepad = useGamepadPresence();

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden rounded-[var(--r-panel)] border border-border bg-viewport shadow-[var(--e2)]">
      {/* Full-bleed feed + overlays */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showVideo ? (
          <LingbotMainVideoView className="h-full w-full" videoObjectFit="cover" muted={muted} />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <LakshMark className="text-hud-dim" width={40} height={40} />
            {busy ? (
              <>
                <div className="flex items-center gap-2 text-[20px] font-light text-muted">
                  <Spinner className="spin" width={18} height={18} />
                  {busyLabel || "Working…"}
                </div>
                <p className="text-[12px] text-faint">Establishing world-model feed…</p>
              </>
            ) : (
              <>
                <h2 className="text-[24px] font-light tracking-tight text-muted">
                  Laksh GCS · Standby
                </h2>
                <p className="text-[12px] text-faint">
                  Select a mission seed and ARM the feed to begin.
                </p>
              </>
            )}
          </div>
        )}

        {/* Tactical scanline sweep over the live feed */}
        {showVideo && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.06]">
            <div className="scan-sweep h-1/2 w-full bg-gradient-to-b from-transparent via-[color:var(--hud)] to-transparent" />
          </div>
        )}

        {/* Spatial HUD — stays over the feed (belongs on the video). */}
        {started && (
          <>
            <ArtificialHorizon />
            <CompassRibbon />
            <Reticle />
            <Minimap />
            <VirtualJoysticks />
            {/* Telemetry strip duplicates the right rail — only when rail is collapsed. */}
            <div className="xl:hidden">
              <TelemetryStrip />
            </div>
          </>
        )}
        {/* Link quality lives in the right rail; mirror on the feed when collapsed. */}
        {status !== "disconnected" && (
          <div className="xl:hidden">
            <LinkQuality />
          </div>
        )}
        <Alerts />
      </div>

      {/* Operator control deck (chrome at the edge, not over the feed) */}
      <div
        className="flex items-center justify-between gap-3 border-t border-border px-3 py-2"
        style={{ background: "var(--glass-strong)", backdropFilter: "var(--blur-sm)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 pr-1">
            <span
              className={`h-2 w-2 rounded-full ${running ? "pulse-dot" : ""}`}
              style={{ background: meta.color }}
            />
            <span className="label-mono" style={{ color: "var(--foreground)" }}>
              {meta.label}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <ToolbarButton title="Terminate session" onClick={stop} disabled={status === "disconnected"}>
            <Power />
          </ToolbarButton>
          <ToolbarButton title="Reset world (re-acquire)" onClick={reset} disabled={!started}>
            <Refresh />
          </ToolbarButton>
          <ToolbarButton title={paused ? "Resume" : "Pause"} onClick={togglePause} disabled={!started}>
            {paused ? <Play /> : <Pause />}
          </ToolbarButton>
          <ToolbarButton title={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)}>
            <MuteToggle muted={muted} />
          </ToolbarButton>
          <ToolbarButton title="Drop waypoint" onClick={dropWaypoint} disabled={!started}>
            <MapPin />
          </ToolbarButton>
        </div>

        {/* Control profile + sensitivity */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="label-mono">Profile</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              {(["stabilised", "manual"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProfile(p)}
                  className="px-2 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    background: profile === p ? "var(--accent-soft)" : "transparent",
                    color: profile === p ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {p === "stabilised" ? "STAB" : "ACRO"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="label-mono">Sens</span>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="reactor-range w-28"
              title="Rotation sensitivity (deg / latent-frame)"
            />
            <span className="hud-readout w-8 text-[11px]">{sensitivity}°</span>
          </div>

          <div
            className="flex items-center gap-1.5 rounded-md border px-2 py-1"
            style={{
              borderColor: gamepad ? "var(--accent-active)" : "var(--border)",
              color: gamepad ? "var(--accent)" : "var(--faint)",
            }}
            title={gamepad ? "Gamepad connected" : "No gamepad"}
          >
            <Gamepad width={14} height={14} />
            <Crosshair width={13} height={13} />
          </div>

          <ClipMenu />
        </div>
      </div>
    </div>
  );
}
