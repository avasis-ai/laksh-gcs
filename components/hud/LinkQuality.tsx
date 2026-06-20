"use client";

import { useStats } from "@reactor-team/js-sdk";

import { useStudio } from "../StudioProvider";
import { Link } from "../icons";

type Level = "good" | "fair" | "poor" | "none";

/**
 * Stats-driven link-quality HUD (playbook §4.3). Reads the real ConnectionStats
 * fields from useStats(): rtt, framesPerSecond, packetLossRatio, jitter,
 * candidateType. Surfaces a green/amber/red link grade and warns on a relayed
 * (TURN) path which adds latency.
 */
function grade(rtt?: number, loss?: number, fps?: number): Level {
  if (rtt === undefined && loss === undefined && fps === undefined) return "none";
  const r = rtt ?? 0;
  const l = (loss ?? 0) * 100;
  const f = fps ?? 16;
  if (r < 120 && l < 2 && f >= 13) return "good";
  if (r < 260 && l < 6 && f >= 9) return "fair";
  return "poor";
}

const LEVEL_COLOR: Record<Level, string> = {
  good: "var(--good)",
  fair: "var(--caution)",
  poor: "var(--danger)",
  none: "var(--faint)",
};

function Bars({ level }: { level: Level }) {
  const filled = level === "good" ? 3 : level === "fair" ? 2 : level === "poor" ? 1 : 0;
  return (
    <div className="flex items-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1 rounded-sm"
          style={{
            height: `${5 + i * 4}px`,
            background: i < filled ? LEVEL_COLOR[level] : "var(--surface-raised)",
          }}
        />
      ))}
    </div>
  );
}

export function LinkQuality() {
  const stats = useStats();
  const { status, sessionSeconds } = useStudio();
  const level = grade(stats?.rtt, stats?.packetLossRatio, stats?.framesPerSecond);
  const relayed = stats?.candidateType === "relay";
  const mins = Math.floor(sessionSeconds / 60);
  const secs = sessionSeconds % 60;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10">
      <div className="min-w-[176px] rounded-md border border-[color:var(--border-strong)] bg-black/55 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 label-mono text-[8px]">
            <Link width={11} height={11} style={{ color: LEVEL_COLOR[level] }} />
            DATALINK
          </span>
          <Bars level={level} />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <Stat label="RTT" value={stats?.rtt !== undefined ? `${Math.round(stats.rtt)}ms` : "—"} />
          <Stat label="FPS" value={stats?.framesPerSecond !== undefined ? Math.round(stats.framesPerSecond).toString() : "—"} />
          <Stat label="LOSS" value={stats?.packetLossRatio !== undefined ? `${(stats.packetLossRatio * 100).toFixed(1)}%` : "—"} />
          <Stat label="JIT" value={stats?.jitter !== undefined ? `${Math.round(stats.jitter * 1000)}ms` : "—"} />
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-[color:var(--border)] pt-1.5">
          <span className="label-mono text-[8px]">{status.toUpperCase()}</span>
          <span className="hud-readout text-[10px]">
            {mins.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}
          </span>
        </div>
        {relayed && (
          <div className="mt-1 text-[8px] font-medium text-[color:var(--caution)]">
            ⚠ RELAY PATH · added latency
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label-mono text-[8px]">{label}</span>
      <span className="hud-readout text-[10px]">{value}</span>
    </div>
  );
}
