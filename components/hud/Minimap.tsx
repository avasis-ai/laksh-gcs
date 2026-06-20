"use client";

import { useStudio } from "../StudioProvider";
import { useFlight } from "./useFlight";

const MARKER_COLOR: Record<string, string> = {
  vehicle: "var(--danger)",
  personnel: "var(--danger)",
  structure: "var(--caution)",
  naval: "var(--info)",
  hazard: "var(--caution)",
  waypoint: "var(--accent)",
};

/**
 * Synthetic minimap — a top-down schematic of the dead-reckoned pseudo-position
 * with AO boundary, breadcrumb trail, and operator-placed / injected markers.
 * Pure client-side, since the model has no global map or object permanence
 * (playbook §4.5).
 */
export function Minimap() {
  const f = useFlight();
  const { markers } = useStudio();

  // World units → minimap px. Centre the craft; scale so ~600m fits.
  const SIZE = 150;
  const SCALE = SIZE / 1400;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const project = (wx: number, wy: number) => {
    const dx = (wx - f.posX) * SCALE;
    const dy = (wy - f.posY) * SCALE;
    // North up: world +Y (north) → screen up.
    return { x: cx + dx, y: cy - dy };
  };

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10">
      <div className="rounded-md border border-[color:var(--border-strong)] bg-black/55 p-1.5 backdrop-blur-sm">
        <svg width={SIZE} height={SIZE} className="block">
          {/* AO grid */}
          <rect x="0" y="0" width={SIZE} height={SIZE} fill="none" stroke="var(--border-strong)" strokeWidth="1" />
          {[0.25, 0.5, 0.75].map((g) => (
            <g key={g}>
              <line x1={SIZE * g} y1="0" x2={SIZE * g} y2={SIZE} stroke="var(--border)" strokeWidth="0.5" />
              <line x1="0" y1={SIZE * g} x2={SIZE} y2={SIZE * g} stroke="var(--border)" strokeWidth="0.5" />
            </g>
          ))}
          {/* AO boundary ring */}
          <circle cx={cx} cy={cy} r={SIZE * 0.46} fill="none" stroke="var(--hud-dim)" strokeWidth="0.75" strokeDasharray="3 3" />

          {/* Markers */}
          {markers.map((m) => {
            const p = project(m.posX, m.posY);
            if (p.x < 2 || p.x > SIZE - 2 || p.y < 2 || p.y > SIZE - 2) return null;
            const color = MARKER_COLOR[m.kind] ?? "var(--caution)";
            return (
              <g key={m.id}>
                <rect x={p.x - 2.5} y={p.y - 2.5} width="5" height="5" fill={color} transform={`rotate(45 ${p.x} ${p.y})`} />
              </g>
            );
          })}

          {/* Ownship (centre), pointing to heading */}
          <g transform={`rotate(${f.heading} ${cx} ${cy})`}>
            <path d={`M ${cx} ${cy - 6} L ${cx - 4} ${cy + 5} L ${cx} ${cy + 2} L ${cx + 4} ${cy + 5} Z`} fill="var(--accent)" />
          </g>
        </svg>
        <div className="mt-1 flex items-center justify-between px-0.5">
          <span className="label-mono text-[8px]">AO MAP</span>
          <span className="hud-readout text-[8px]">
            {Math.round(f.posX)}E {Math.round(f.posY)}N
          </span>
        </div>
      </div>
    </div>
  );
}
