"use client";

import { useState } from "react";

import { LingbotMainVideoView, useLingbot } from "@reactor-models/lingbot";

import { ATMOSPHERE_EVENTS } from "@/lib/scenes";
import { useStudio } from "./StudioProvider";
import {
  ChevronDown,
  Download,
  Layers,
  MuteToggle,
  Pause,
  Play,
  Power,
  ReactorMark,
  Refresh,
  Scissors,
  Spinner,
} from "./icons";

function statusMeta(status: string, running: boolean, paused: boolean) {
  if (paused) return { label: "PAUSED", color: "var(--muted)" };
  if (running) return { label: "LIVE", color: "var(--good)" };
  switch (status) {
    case "ready":
      return { label: "READY", color: "var(--ready)" };
    case "connecting":
      return { label: "CONNECTING", color: "var(--ready)" };
    case "waiting":
      return { label: "WAITING", color: "var(--ready)" };
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
        color: active ? "var(--accent-foreground)" : undefined,
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
      const clip =
        kind === "full"
          ? await lb.requestRecording()
          : await lb.requestClip(Number(kind));
      await lb.downloadClipAsFile(clip, `lingbot-${kind}-${Date.now()}.mp4`);
    } catch {
      // surfaced elsewhere; keep toolbar quiet
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
        className="flex h-8 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-surface px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {working ? <Spinner className="spin" /> : <Scissors className="text-muted" />}
        Clip
      </button>
      <button
        type="button"
        disabled={!ready || working !== null}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center rounded-r-md border border-border bg-surface px-1.5 text-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Clip options"
      >
        <ChevronDown />
      </button>
      {open && (
        <div className="absolute bottom-10 right-0 z-20 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
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
            {muted ? "Unmute output" : "Mute output"}
          </button>
        </div>
      )}
    </div>
  );
}

export function Viewport() {
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
    applyAtmosphere,
    error,
    clearError,
  } = useStudio();

  const running = Boolean(state?.running);
  const started = Boolean(state?.started);
  const paused = Boolean(state?.paused);
  const meta = statusMeta(status, running, paused);
  const showVideo = hasVideo && started;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-viewport">
      {/* Video / empty state */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showVideo ? (
          <LingbotMainVideoView
            className="h-full w-full"
            videoObjectFit="cover"
            muted={muted}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <ReactorMark className="text-faint" width={34} height={34} />
            {busy ? (
              <>
                <div className="flex items-center gap-2 text-[22px] font-light text-muted">
                  <Spinner className="spin" width={20} height={20} />
                  {busyLabel || "Working…"}
                </div>
                <p className="text-[12px] text-faint">This can take a few seconds</p>
              </>
            ) : (
              <>
                <h2 className="text-[26px] font-light tracking-tight text-muted">
                  Enter a prompt
                </h2>
                <p className="text-[12px] text-faint">Press generate to begin</p>
              </>
            )}
          </div>
        )}

        {/* Atmosphere quick-swap (only while live) */}
        {started && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-1.5">
            {ATMOSPHERE_EVENTS.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => applyAtmosphere(ev.suffix)}
                className="rounded-full border border-white/40 bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
              >
                {ev.label}
              </button>
            ))}
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[80%] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
            <span className="text-[12px] text-danger">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-[11px] text-muted hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-t border-border bg-surface px-3 py-2">
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
          <ToolbarButton title="Stop session" onClick={stop} disabled={status === "disconnected"}>
            <Power />
          </ToolbarButton>
          <ToolbarButton title="Reset world" onClick={reset} disabled={!started}>
            <Refresh />
          </ToolbarButton>
          <ToolbarButton
            title={paused ? "Resume" : "Pause"}
            onClick={togglePause}
            disabled={!started}
          >
            {paused ? <Play /> : <Pause />}
          </ToolbarButton>
          <ToolbarButton
            title={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted(!muted)}
            active={false}
          >
            <MuteToggle muted={muted} />
          </ToolbarButton>
          <ToolbarButton title="Stats" disabled>
            <Layers />
          </ToolbarButton>
          {state ? (
            <span className="ml-1 text-[11px] text-faint">chunk {state.current_chunk}</span>
          ) : null}
        </div>

        <ClipMenu />
      </div>
    </div>
  );
}
