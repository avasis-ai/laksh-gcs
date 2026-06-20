// Laksh client-side prediction / HUD kinematics engine (playbook §4.2.4).
//
// The model only reacts at chunk boundaries (~1s lag). The HUD must react to
// INPUT immediately. This is a lightweight kinematic integrator that runs at
// ~60Hz (driven by requestAnimationFrame in the provider) so the artificial
// horizon, compass, speed and pseudo-altitude move instantly, eased/Lerp-
// smoothed (Unity LateUpdate lesson), then gently reconciled toward the model's
// `state` / `active_action` ground truth to avoid drift.
//
// NOTE on fiction: LingBot has no real altitude axis. We FAKE altitude/climb via
// look-vertical + forward (playbook §1, §4.1) and dead-reckon a synthetic map
// position since the model has no object permanence.

import type { ControlProfile, DroneIntent } from "./control";

export interface FlightState {
  /** Heading in degrees, 0..360 (0 = North). */
  heading: number;
  /** Pitch / attitude in degrees, +up / -down (clamped to ±35 for display). */
  pitch: number;
  /** Bank / roll in degrees, +right / -left (visual only). */
  roll: number;
  /** Normalised airspeed 0..1 (maps to a display knots/kmh value). */
  speed: number;
  /** Pseudo-altitude in metres (dead-reckoned fiction). */
  altitude: number;
  /** Throttle 0..1 (eased forward command). */
  throttle: number;
  /** Dead-reckoned map position, arbitrary metres from origin (AO centre). */
  posX: number;
  posY: number;
}

export const INITIAL_FLIGHT: FlightState = {
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 0,
  altitude: 120,
  throttle: 0,
  posX: 0,
  posY: 0,
};

export interface FlightConfig {
  /** Max yaw rate (deg/s) at full deflection, scaled by rotation sensitivity. */
  maxYawRate: number;
  /** Max pitch rate (deg/s) at full deflection. */
  maxPitchRate: number;
  /** Cruise ground speed (metres/s) at full throttle for dead-reckoning. */
  cruiseSpeed: number;
  /** Climb/dive rate (m/s) at full pitch+throttle. */
  climbRate: number;
  /** Easing factor per second for speed/throttle smoothing. */
  smoothing: number;
}

export const DEFAULT_FLIGHT_CONFIG: FlightConfig = {
  maxYawRate: 45,
  maxPitchRate: 30,
  cruiseSpeed: 26,
  climbRate: 9,
  smoothing: 4,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Stateful 60Hz flight integrator. Pure of React — the provider owns one
 * instance and snapshots it each frame.
 */
export class FlightModel {
  private s: FlightState = { ...INITIAL_FLIGHT };
  private cfg: FlightConfig;

  constructor(cfg: Partial<FlightConfig> = {}) {
    this.cfg = { ...DEFAULT_FLIGHT_CONFIG, ...cfg };
  }

  reset(heading = 0): void {
    this.s = { ...INITIAL_FLIGHT, heading: wrap360(heading) };
  }

  getState(): FlightState {
    return { ...this.s };
  }

  /**
   * Advance the kinematic model by dt seconds given current shaped intent.
   * `rotationSensitivity` (0..1) scales yaw/pitch rates so the HUD speed of
   * rotation matches the rotation_speed_deg the operator selected.
   */
  step(
    intent: DroneIntent,
    dt: number,
    profile: ControlProfile,
    rotationSensitivity: number,
  ): FlightState {
    const s = this.s;
    const cfg = this.cfg;
    const dtc = clamp(dt, 0, 0.1); // guard against tab-switch dt spikes
    const rotScale = 0.35 + 0.65 * clamp(rotationSensitivity, 0, 1);

    // Heading from yaw.
    s.heading = wrap360(s.heading + intent.yaw * cfg.maxYawRate * rotScale * dtc);

    // Pitch: manual integrates and holds (acro); stabilised self-levels toward
    // the commanded value and recenters to 0 on release (angle-mode emulation).
    if (profile === "manual") {
      s.pitch = clamp(s.pitch + intent.pitch * cfg.maxPitchRate * rotScale * dtc, -35, 35);
    } else {
      const target = intent.pitch * 18; // stick → target tilt
      s.pitch = lerp(s.pitch, target, cfg.smoothing * dtc);
    }

    // Roll / bank: purely visual, derived from yaw + strafe; stabilised levels.
    const bankTarget = (intent.yaw * 18 + intent.strafe * 12);
    const bankEase = profile === "stabilised" ? cfg.smoothing : cfg.smoothing * 0.6;
    s.roll = lerp(s.roll, clamp(bankTarget, -30, 30), bankEase * dtc);

    // Throttle / speed eased toward forward intent magnitude.
    const fwd = Math.max(0, intent.throttle); // forward contributes to speed
    const back = Math.max(0, -intent.throttle);
    const targetThrottle = clamp(fwd + Math.abs(intent.strafe) * 0.5, 0, 1);
    s.throttle = lerp(s.throttle, targetThrottle, cfg.smoothing * dtc);
    s.speed = lerp(s.speed, targetThrottle, cfg.smoothing * dtc);

    // Pseudo-altitude (the documented fiction): climb when pitching up while
    // moving forward; dive when pitching down + forward; gentle drift otherwise.
    const climb = (s.pitch / 35) * (fwd) * cfg.climbRate;
    s.altitude = clamp(s.altitude + climb * dtc, 0, 4000);

    // Dead-reckon synthetic map position from heading + ground speed.
    const ground = (fwd - back) * cfg.cruiseSpeed * dtc;
    const rad = (s.heading * Math.PI) / 180;
    s.posX += Math.sin(rad) * ground;
    s.posY += Math.cos(rad) * ground;
    // Strafe nudges position perpendicular to heading.
    const strafeGround = intent.strafe * cfg.cruiseSpeed * 0.7 * dtc;
    s.posX += Math.cos(rad) * strafeGround;
    s.posY -= Math.sin(rad) * strafeGround;

    return { ...s };
  }

  /**
   * Gently reconcile predicted state toward the model's ground-truth discrete
   * action (`active_action` string e.g. "w+left+up"). Keeps the HUD honest
   * without snapping. Called on each chunk_complete.
   */
  reconcile(activeAction: string | undefined, dt: number): void {
    if (!activeAction || activeAction === "still") return;
    const s = this.s;
    const dtc = clamp(dt, 0, 0.5);
    const k = 0.5 * dtc; // weak reconciliation gain
    // If model reports no look but HUD drifted, ease pitch toward level.
    const looksLeft = activeAction.includes("left");
    const looksRight = activeAction.includes("right");
    const looksUp = activeAction.includes("up");
    const looksDown = activeAction.includes("down");
    if (!looksLeft && !looksRight) {
      // no yaw command active — nothing to nudge for heading (free-running ok)
    }
    if (!looksUp && !looksDown) {
      s.pitch = lerp(s.pitch, 0, k);
    }
  }
}

/** Convert normalised speed (0..1) to a display value in km/h. */
export function speedToKmh(speed: number): number {
  return Math.round(speed * 95);
}

/** 16-point compass rose label for a heading. */
export function headingToCardinal(heading: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(wrap360(heading) / 22.5) % 16];
}
