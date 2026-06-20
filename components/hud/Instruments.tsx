"use client";

import { headingToCardinal, speedToKmh } from "@/lib/laksh/flightModel";
import { useStudio } from "../StudioProvider";
import { useFlight } from "./useFlight";

/**
 * Artificial horizon — eased pitch + roll attitude indicator, client-predicted.
 * Rendered as a translucent overlay over the centre of the feed.
 */
export function ArtificialHorizon() {
  const f = useFlight();
  // Roll rotates the horizon line; pitch translates it. 1 deg pitch ≈ 3px.
  const pitchPx = f.pitch * 3.2;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="relative h-[60%] w-[60%] max-w-[520px]"
        style={{ transform: `rotate(${-f.roll}deg)` }}
      >
        <div
          className="absolute inset-x-0 top-1/2"
          style={{ transform: `translateY(${pitchPx}px)` }}
        >
          {/* Horizon line */}
          <div className="relative">
            <div className="absolute left-1/2 h-px w-[120%] -translate-x-1/2 bg-[color:var(--hud)] opacity-50" />
            {/* Pitch ladder */}
            {[-20, -10, 10, 20].map((deg) => (
              <div
                key={deg}
                className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2"
                style={{ top: `${-deg * 3.2}px` }}
              >
                <span className="hud-readout text-[9px] opacity-60">{Math.abs(deg)}</span>
                <div className="h-px w-20 bg-[color:var(--hud)] opacity-30" />
                <span className="hud-readout text-[9px] opacity-60">{Math.abs(deg)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fixed centre reticle / boresight with target markers projected onto the feed. */
export function Reticle() {
  const f = useFlight();
  const { markers } = useStudio();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-24 w-24 text-[color:var(--hud)] opacity-70">
        <circle cx="50" cy="50" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M50 30v10M50 60v10M30 50h10M60 50h10" stroke="currentColor" strokeWidth="1" />
      </svg>
      {/* Project nearby markers that fall roughly ahead onto the feed as ticks. */}
      {markers.map((m) => {
        const dx = m.posX - f.posX;
        const dy = m.posY - f.posY;
        const range = Math.hypot(dx, dy);
        const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
        let rel = bearing - f.heading;
        while (rel > 180) rel -= 360;
        while (rel < -180) rel += 360;
        if (Math.abs(rel) > 28 || range > 1200) return null;
        const left = 50 + (rel / 28) * 38;
        return (
          <div
            key={m.id}
            className="absolute top-[42%] -translate-x-1/2"
            style={{ left: `${left}%` }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <div className="h-3 w-3 rotate-45 border border-[color:var(--danger)]" />
              <span className="hud-readout whitespace-nowrap text-[8px] text-[color:var(--danger)]">
                {m.label} · {Math.round(range)}m
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compass / heading ribbon across the top of the feed. */
export function CompassRibbon() {
  const f = useFlight();
  const ticks: number[] = [];
  for (let i = -60; i <= 60; i += 10) {
    ticks.push(Math.round(f.heading / 10) * 10 + i);
  }
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-[min(560px,70%)] -translate-x-1/2">
      <div className="relative h-9 overflow-hidden rounded-md border border-[color:var(--border-strong)] bg-black/45 backdrop-blur-sm">
        <div className="absolute inset-0 flex items-center">
          {ticks.map((t) => {
            const norm = ((t % 360) + 360) % 360;
            const delta = norm - f.heading;
            let d = delta;
            while (d > 180) d -= 360;
            while (d < -180) d += 360;
            const left = 50 + (d / 60) * 50;
            if (left < 0 || left > 100) return null;
            const major = norm % 30 === 0;
            return (
              <div key={t} className="absolute flex flex-col items-center" style={{ left: `${left}%`, transform: "translateX(-50%)" }}>
                <div className={`w-px ${major ? "h-3 bg-[color:var(--hud)]" : "h-1.5 bg-[color:var(--hud-dim)]"}`} />
                {major && (
                  <span className="hud-readout mt-0.5 text-[9px]">
                    {norm === 0 ? "N" : norm === 90 ? "E" : norm === 180 ? "S" : norm === 270 ? "W" : norm}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Centre index */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[color:var(--accent)]" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2">
          <div className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-[color:var(--accent)]" />
        </div>
      </div>
      <div className="mt-1 text-center">
        <span className="hud-readout text-[11px]">
          {Math.round(f.heading).toString().padStart(3, "0")}° {headingToCardinal(f.heading)}
        </span>
      </div>
    </div>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="label-mono text-[8px]">{label}</span>
      <span className="hud-readout text-[15px] font-semibold leading-tight">
        {value}
        {unit && <span className="ml-0.5 text-[9px] opacity-70">{unit}</span>}
      </span>
    </div>
  );
}

/** Bottom telemetry strip: speed, altitude, throttle, mode (DJI/Unity OSD baseline). */
export function TelemetryStrip() {
  const f = useFlight();
  const { profile, state } = useStudio();
  const throttlePct = Math.round(f.throttle * 100);
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-end gap-5 rounded-md border border-[color:var(--border-strong)] bg-black/45 px-4 py-2 backdrop-blur-sm">
        <Readout label="SPD" value={String(speedToKmh(f.speed))} unit="km/h" />
        <div className="h-7 w-px bg-[color:var(--border-strong)]" />
        <Readout label="ALT" value={String(Math.round(f.altitude))} unit="m" />
        <div className="h-7 w-px bg-[color:var(--border-strong)]" />
        <div className="flex flex-col items-center gap-1">
          <span className="label-mono text-[8px]">THR</span>
          <div className="h-2 w-16 overflow-hidden rounded-full bg-[color:var(--surface-raised)]">
            <div className="h-full bg-[color:var(--hud)]" style={{ width: `${throttlePct}%` }} />
          </div>
        </div>
        <div className="h-7 w-px bg-[color:var(--border-strong)]" />
        <Readout label="MODE" value={profile === "stabilised" ? "STAB" : "ACRO"} />
        <div className="h-7 w-px bg-[color:var(--border-strong)]" />
        <Readout label="CHUNK" value={state ? String(state.current_chunk) : "—"} />
      </div>
    </div>
  );
}
