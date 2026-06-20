"use client";

import { useEffect, useState } from "react";

import { useStats } from "@reactor-team/js-sdk";

import { useStudio } from "./StudioProvider";
import { LakshMark } from "./icons";

/**
 * Derive the single system state-of-truth shown across the console chrome.
 * Mirrors the feed status badge so the command bar and viewport never disagree.
 */
function systemState(status: string, running: boolean, paused: boolean) {
  if (paused) return { label: "PAUSED", color: "var(--caution)" };
  if (running) return { label: "LIVE", color: "var(--good)" };
  switch (status) {
    case "ready":
      return { label: "ARMED", color: "var(--ready)" };
    case "connecting":
      return { label: "LINKING", color: "var(--ready)" };
    case "waiting":
      return { label: "TASKING", color: "var(--ready)" };
    default:
      return { label: "OFFLINE", color: "var(--faint)" };
  }
}

function clock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Live UTC wall-clock — the mission reference time. */
function useUtcClock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Top command / status bar spanning the full console width. Owns Laksh's
 * identity (callsign) and surfaces the system state-of-truth: OFFLINE / ARMED /
 * LIVE / PAUSED, the mission (session) clock, datalink RTT, and UTC reference.
 */
export function CommandBar() {
  const { status, state, sessionSeconds, linkArmed } = useStudio();
  const stats = useStats();
  const utc = useUtcClock();

  const running = Boolean(state?.running);
  const paused = Boolean(state?.paused);
  const sys = systemState(status, running, paused);
  const linkLost = linkArmed && status === "disconnected";

  return (
    <header
      className="flex h-[var(--cmdbar)] shrink-0 items-center justify-between gap-3 border-b border-border px-3"
      style={{ background: "var(--glass-strong)", backdropFilter: "var(--blur-md)" }}
    >
      {/* Identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--accent-active)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <LakshMark width={16} height={16} />
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold leading-none tracking-[0.04em]">LAKSH</span>
          <span className="hud-readout text-[9px] opacity-70">GCS</span>
        </div>
        <span className="hidden h-3.5 w-px bg-border sm:block" />
        <span className="hidden truncate text-[11px] text-muted sm:block">
          CelesticLabs · UAV World Model
        </span>
      </div>

      {/* State of truth */}
      <div className="flex items-center gap-2.5">
        <div className="cmd-chip">
          <span
            className={`h-2 w-2 rounded-full ${running || linkLost ? "pulse-dot" : ""}`}
            style={{ background: linkLost ? "var(--danger)" : sys.color }}
          />
          <span className="label-mono text-[10px]" style={{ color: "var(--foreground)" }}>
            {linkLost ? "LINK LOST" : sys.label}
          </span>
        </div>

        <div className="hidden cmd-chip sm:inline-flex">
          <span className="label-mono">MSN</span>
          <span className="hud-readout text-[11px]">{clock(sessionSeconds)}</span>
        </div>

        <div className="hidden cmd-chip md:inline-flex">
          <span className="label-mono">RTT</span>
          <span className="hud-readout text-[11px]">
            {stats?.rtt !== undefined ? `${Math.round(stats.rtt)}ms` : "—"}
          </span>
        </div>

        <div className="cmd-chip">
          <span className="label-mono">UTC</span>
          <span className="hud-readout text-[11px]">{utc}</span>
        </div>
      </div>
    </header>
  );
}
