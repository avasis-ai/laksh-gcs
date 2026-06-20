// Laksh intent → LingBot primitive control layer.
//
// The fundamental challenge (see docs/research/responsiveness-playbook.md §4.1):
// continuous, multi-axis drone intent must be quantised into the FIVE discrete,
// persistent, chunk-quantised LingBot commands:
//   setMovement(idle|forward|back|strafe_left|strafe_right)
//   setLookHorizontal(idle|left|right)
//   setLookVertical(idle|up|down)
//   setRotationSpeedDeg(0..30)
//   setPrompt(string)   <- handled by the scene-graph, not here
//
// Strategy: shape analog input (deadzone + expo), derive persistent state, and
// flush state changes at most once per chunk boundary (last-write-wins), always
// emitting `idle` immediately on release.

export type Movement = "idle" | "forward" | "back" | "strafe_left" | "strafe_right";
export type LookH = "idle" | "left" | "right";
export type LookV = "idle" | "up" | "down";

/** Selectable control profile (Unity FPV "flight mode" lesson, playbook §3). */
export type ControlProfile = "stabilised" | "manual";

/**
 * Normalised drone intent. Every input source (keyboard, gamepad, virtual
 * joystick) is reduced to this single bus, each axis in [-1, 1].
 */
export interface DroneIntent {
  /** Forward(+) / back(-) translation — throttle along the look axis. */
  throttle: number;
  /** Strafe right(+) / left(-) — lateral translation. */
  strafe: number;
  /** Yaw right(+) / left(-) — heading change / camera pan. */
  yaw: number;
  /** Pitch up(+) / down(-) — camera tilt / climb-dive fiction. */
  pitch: number;
  /**
   * Which translation axis was most recently engaged. Movement is mutually
   * exclusive in LingBot, so we arbitrate most-recent-wins (LIFO) rather than a
   * static W>S>A>D priority — feels more responsive (playbook §4.2.3).
   */
  recentAxis: "throttle" | "strafe";
}

export const ZERO_INTENT: DroneIntent = {
  throttle: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  recentAxis: "throttle",
};

/** The four persistent primitive states Laksh drives. */
export interface Primitives {
  movement: Movement;
  lookH: LookH;
  lookV: LookV;
  rotationSpeedDeg: number;
}

export const IDLE_PRIMITIVES: Primitives = {
  movement: "idle",
  lookH: "idle",
  lookV: "idle",
  rotationSpeedDeg: 5,
};

export interface ShapeOptions {
  /** Deadzone — input below this magnitude reads as 0 (kills stick drift). */
  deadzone: number;
  /** Expo curve strength (0 = linear, 1 = full cubic). Soft near centre. */
  expo: number;
}

export const DEFAULT_SHAPE: ShapeOptions = { deadzone: 0.12, expo: 0.3 };

/**
 * Deadzone + expo shaping (Unity FPV "responsiveness secret sauce", playbook §3).
 * - Deadzone: zero out drift, then rescale so full range is still reachable.
 * - Expo: cubic blend `expo*x^3 + (1-expo)*x` → precise near centre, full
 *   authority at the edges.
 */
export function shapeAxis(value: number, opts: ShapeOptions = DEFAULT_SHAPE): number {
  const sign = Math.sign(value);
  const mag = Math.min(1, Math.abs(value));
  if (mag <= opts.deadzone) return 0;
  // Rescale past the deadzone back to a full 0..1 range.
  const scaled = (mag - opts.deadzone) / (1 - opts.deadzone);
  const expo = opts.expo * scaled * scaled * scaled + (1 - opts.expo) * scaled;
  return sign * expo;
}

export interface CompileOptions {
  shape: ShapeOptions;
  /** Sensitivity ceiling for rotation speed in deg/latent-frame (0..30). */
  sensitivity: number;
  profile: ControlProfile;
}

export const DEFAULT_COMPILE: CompileOptions = {
  shape: DEFAULT_SHAPE,
  sensitivity: 18,
  profile: "stabilised",
};

/**
 * Compile a continuous {@link DroneIntent} into the discrete persistent
 * {@link Primitives}. This is the heart of the intent→primitive layer.
 */
export function compileIntent(intent: DroneIntent, opts: CompileOptions = DEFAULT_COMPILE): Primitives {
  const fwd = shapeAxis(intent.throttle, opts.shape);
  const strafe = shapeAxis(intent.strafe, opts.shape);
  const yaw = shapeAxis(intent.yaw, opts.shape);
  const pitch = shapeAxis(intent.pitch, opts.shape);

  // Movement is single-axis & mutually exclusive — arbitrate.
  let movement: Movement = "idle";
  const fwdActive = fwd !== 0;
  const strafeActive = strafe !== 0;
  let useThrottle = false;
  if (fwdActive && strafeActive) {
    useThrottle = intent.recentAxis === "throttle";
  } else if (fwdActive) {
    useThrottle = true;
  } else if (strafeActive) {
    useThrottle = false;
  }
  if (fwdActive || strafeActive) {
    movement = useThrottle
      ? fwd > 0
        ? "forward"
        : "back"
      : strafe > 0
        ? "strafe_right"
        : "strafe_left";
  }

  const lookH: LookH = yaw === 0 ? "idle" : yaw > 0 ? "right" : "left";
  const lookV: LookV = pitch === 0 ? "idle" : pitch > 0 ? "up" : "down";

  // rotation_speed_deg is the ONLY analog magnitude knob, shared by both look
  // axes. Bind the larger look deflection → 0..sensitivity via the expo curve.
  const lookMag = Math.max(Math.abs(yaw), Math.abs(pitch));
  let rotationSpeedDeg = IDLE_PRIMITIVES.rotationSpeedDeg;
  if (lookMag > 0) {
    rotationSpeedDeg = clamp(round1(lookMag * opts.sensitivity), 0.5, 30);
  }

  return { movement, lookH, lookV, rotationSpeedDeg };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface CommandSinks {
  setMovement: (m: Movement) => void;
  setLookH: (l: LookH) => void;
  setLookV: (l: LookV) => void;
  setRotationSpeedDeg: (deg: number) => void;
}

/**
 * Command coalescer (playbook §4.2.1–§4.2.2).
 *
 * Buffers the latest desired primitive state and flushes the *diff* at most once
 * per chunk boundary (last-write-wins). Rapid taps between chunks collapse to the
 * final intent. Releases to `idle` flush immediately for safety/responsiveness,
 * so a control never "sticks".
 */
export class CommandCoalescer {
  private desired: Primitives = { ...IDLE_PRIMITIVES };
  private lastSent: Primitives | null = null;
  private readonly sinks: CommandSinks;
  /** Minimum rotation-speed delta worth re-sending. */
  private readonly rotEpsilon = 0.4;

  constructor(sinks: CommandSinks) {
    this.sinks = sinks;
  }

  /** Update the buffered desired state. Idle-releases flush immediately. */
  setDesired(next: Primitives): void {
    const prev = this.desired;
    this.desired = next;
    const released =
      (prev.movement !== "idle" && next.movement === "idle") ||
      (prev.lookH !== "idle" && next.lookH === "idle") ||
      (prev.lookV !== "idle" && next.lookV === "idle");
    if (released) this.flush();
  }

  /** Get the currently buffered desired primitives. */
  getDesired(): Primitives {
    return this.desired;
  }

  /**
   * Send any changed primitives to the model. Call this on every `chunk_complete`
   * (the control cadence) and on idle-release. Returns the set of fields sent.
   */
  flush(): Partial<Primitives> {
    const sent: Partial<Primitives> = {};
    const last = this.lastSent;
    const d = this.desired;

    if (!last || last.movement !== d.movement) {
      this.sinks.setMovement(d.movement);
      sent.movement = d.movement;
    }
    if (!last || last.lookH !== d.lookH) {
      this.sinks.setLookH(d.lookH);
      sent.lookH = d.lookH;
    }
    if (!last || last.lookV !== d.lookV) {
      this.sinks.setLookV(d.lookV);
      sent.lookV = d.lookV;
    }
    const looking = d.lookH !== "idle" || d.lookV !== "idle";
    if (looking && (!last || Math.abs(last.rotationSpeedDeg - d.rotationSpeedDeg) >= this.rotEpsilon)) {
      this.sinks.setRotationSpeedDeg(d.rotationSpeedDeg);
      sent.rotationSpeedDeg = d.rotationSpeedDeg;
    }

    this.lastSent = { ...d };
    return sent;
  }

  /** Forget what was sent (e.g. after reset/disconnect) so next flush re-arms. */
  reset(): void {
    this.desired = { ...IDLE_PRIMITIVES };
    this.lastSent = null;
  }
}
