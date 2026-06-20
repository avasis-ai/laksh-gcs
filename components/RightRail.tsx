"use client";

import { useEffect, useState } from "react";

import { useStats } from "@reactor-team/js-sdk";

import { fetchPricing } from "@/lib/reactor/client";
import { headingToCardinal, speedToKmh } from "@/lib/laksh/flightModel";
import type { PricingResponse } from "@/lib/reactor/types";
import { useStudio } from "./StudioProvider";
import { useFlight } from "./hud/useFlight";
import { Link, MapPin, Target } from "./icons";

/* ------------------------------------------------------------------ */
/* Panel primitive                                                     */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  right,
  children,
  bodyClass = "",
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="label-mono">{title}</span>
        {right}
      </div>
      <div className={`px-3 py-2.5 ${bodyClass}`}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Link + session + cost                                               */
/* ------------------------------------------------------------------ */

type Level = "good" | "fair" | "poor" | "none";

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

const LEVEL_LABEL: Record<Level, string> = {
  good: "NOMINAL",
  fair: "DEGRADED",
  poor: "POOR",
  none: "NO LINK",
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

function Pair({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="label-mono text-[9px]">{label}</span>
      <span className="hud-readout text-[11px]" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** Lazily fetch the public pricing table once for live cost estimation. */
function usePricing(): PricingResponse | null {
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPricing()
      .then((p) => {
        if (alive) setPricing(p);
      })
      .catch(() => {
        /* cost estimate degrades to "—" — non-critical */
      });
    return () => {
      alive = false;
    };
  }, []);
  return pricing;
}

function LinkSessionPanel() {
  const stats = useStats();
  const { status, sessionSeconds, linkArmed } = useStudio();
  const pricing = usePricing();

  const level = grade(stats?.rtt, stats?.packetLossRatio, stats?.framesPerSecond);
  const relayed = stats?.candidateType === "relay";
  const armed = linkArmed && status !== "disconnected";

  // Live cost from the real pricing table: credits = rate/s × elapsed.
  const rate = pricing?.models?.[0]?.rate.amount_per_sec;
  const perDollar = pricing?.settings.credits_per_dollar;
  const credits = rate !== undefined ? rate * sessionSeconds : undefined;
  const dollars = credits !== undefined && perDollar ? credits / perDollar : undefined;

  return (
    <Panel
      title="Datalink · Session"
      right={
        <span className="flex items-center gap-1.5">
          <Link width={11} height={11} style={{ color: LEVEL_COLOR[level] }} />
          <Bars level={level} />
        </span>
      }
    >
      <div className="flex items-center justify-between">
        <span className="label-mono text-[9px]">STATUS</span>
        <span className="label-mono text-[9px]" style={{ color: LEVEL_COLOR[level] }}>
          {LEVEL_LABEL[level]}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        <Pair label="RTT" value={stats?.rtt !== undefined ? `${Math.round(stats.rtt)}ms` : "—"} />
        <Pair label="FPS" value={stats?.framesPerSecond !== undefined ? `${Math.round(stats.framesPerSecond)}` : "—"} />
        <Pair label="LOSS" value={stats?.packetLossRatio !== undefined ? `${(stats.packetLossRatio * 100).toFixed(1)}%` : "—"} />
        <Pair label="JIT" value={stats?.jitter !== undefined ? `${Math.round(stats.jitter * 1000)}ms` : "—"} />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2">
        <Pair label="UPLINK" value={status.toUpperCase()} tone={armed ? "var(--good)" : "var(--faint)"} />
        <Pair
          label="EST"
          value={dollars !== undefined ? `$${dollars.toFixed(3)}` : "—"}
          tone={armed ? "var(--ready)" : "var(--faint)"}
        />
      </div>
      {relayed && (
        <div className="mt-2 rounded-[6px] border border-[color:var(--caution)] bg-[rgba(240,163,36,0.1)] px-2 py-1 text-[9px] font-medium text-[color:var(--caution)]">
          RELAY PATH · added latency
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Flight telemetry                                                    */
/* ------------------------------------------------------------------ */

function Readout({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-mono text-[8px]">{label}</span>
      <span className="hud-readout text-[15px] font-semibold leading-none">
        {value}
        {unit && <span className="ml-0.5 text-[9px] opacity-70">{unit}</span>}
      </span>
    </div>
  );
}

function TelemetryPanel() {
  const f = useFlight();
  const { profile, state } = useStudio();
  const stats = useStats();
  const throttlePct = Math.round(f.throttle * 100);
  const action = state?.current_action && state.current_action !== "still" ? state.current_action : "STILL";

  return (
    <Panel title="Flight Telemetry">
      <div className="grid grid-cols-3 gap-y-3">
        <Readout label="HDG" value={`${Math.round(f.heading).toString().padStart(3, "0")}°`} />
        <Readout label="SPD" value={String(speedToKmh(f.speed))} unit="km/h" />
        <Readout label="ALT" value={String(Math.round(f.altitude))} unit="m" />
        <Readout label="CARD" value={headingToCardinal(f.heading)} />
        <Readout label="CHUNK" value={state ? String(state.current_chunk) : "—"} />
        <Readout label="FPS" value={stats?.framesPerSecond !== undefined ? String(Math.round(stats.framesPerSecond)) : "—"} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="label-mono text-[8px]">THR</span>
        <div className="meter flex-1">
          <span style={{ width: `${throttlePct}%` }} />
        </div>
        <span className="hud-readout w-9 text-right text-[11px]">{throttlePct}%</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="label-mono text-[8px]">MODE</span>
        <span className="hud-readout text-[10px]">{profile === "stabilised" ? "STAB" : "ACRO"}</span>
        <span className="label-mono text-[8px]">ACTION</span>
        <span className="hud-readout max-w-[96px] truncate text-[10px]">{action}</span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Active targets                                                      */
/* ------------------------------------------------------------------ */

const MARKER_COLOR: Record<string, string> = {
  vehicle: "var(--danger)",
  personnel: "var(--danger)",
  structure: "var(--caution)",
  naval: "var(--info)",
  hazard: "var(--caution)",
  waypoint: "var(--accent)",
};

function TargetsPanel() {
  const f = useFlight();
  const { markers, clearMarkers } = useStudio();

  return (
    <Panel
      title="Active Targets"
      right={
        markers.length > 0 ? (
          <button type="button" onClick={clearMarkers} className="label-mono transition-colors hover:text-foreground">
            Clear ({markers.length})
          </button>
        ) : (
          <span className="label-mono text-[9px] text-faint">0 TRK</span>
        )
      }
      bodyClass="max-h-[180px] overflow-y-auto scroll-thin"
    >
      {markers.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-faint">
          No tracks. Inject targets or drop a waypoint to populate the track list.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {[...markers].reverse().map((m) => {
            const dx = m.posX - f.posX;
            const dy = m.posY - f.posY;
            const range = Math.round(Math.hypot(dx, dy));
            let bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
            bearing = ((bearing % 360) + 360) % 360;
            const color = MARKER_COLOR[m.kind] ?? "var(--caution)";
            return (
              <li key={m.id} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rotate-45"
                  style={{ border: `1px solid ${color}`, background: m.kind === "waypoint" ? color : "transparent" }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{m.label}</span>
                <span className="hud-readout shrink-0 text-[10px]" style={{ color }}>
                  {Math.round(bearing).toString().padStart(3, "0")}° · {range}m
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Mission log                                                         */
/* ------------------------------------------------------------------ */

function clockLabel(at: number) {
  return new Date(at).toISOString().slice(11, 19);
}

function MissionLogPanel() {
  const { log } = useStudio();
  return (
    <Panel title="Mission Log" bodyClass="max-h-[220px] overflow-y-auto scroll-thin" right={<span className="label-mono text-[9px] text-faint">{log.length}</span>}>
      {log.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-faint">Mission events will appear here.</p>
      ) : (
        <ul className="space-y-1.5">
          {log.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className="hud-readout mt-px shrink-0 text-[9px] text-label">{clockLabel(e.at)}</span>
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    e.level === "alert" ? "var(--danger)" : e.level === "warn" ? "var(--caution)" : "var(--hud-dim)",
                }}
              />
              <span className="text-muted">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Rail                                                                */
/* ------------------------------------------------------------------ */

/**
 * Right monitoring rail — the system's reporting surface. Stacks live datalink
 * + session/cost, flight telemetry, the active track list, and the mission log.
 * All data is real (useStats, flight prediction, markers, mission log, public
 * pricing); nothing is fabricated. Collapses below 1280px (xl) — its critical
 * link/alert data remains available as feed overlays.
 */
export function RightRail() {
  return (
    <aside className="hidden w-[var(--rail)] shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-border bg-surface px-2.5 py-2.5 scroll-thin xl:flex">
      <LinkSessionPanel />
      <TelemetryPanel />
      <TargetsPanel />
      <MissionLogPanel />
      <div className="mt-auto flex items-center justify-between px-1 pt-1 text-[9px] text-faint">
        <span className="flex items-center gap-1.5">
          <Target width={10} height={10} />
          MONITOR
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin width={10} height={10} />
          AO LIVE
        </span>
      </div>
    </aside>
  );
}
