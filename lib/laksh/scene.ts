// Laksh layered prompt scene-graph (playbook §4.4).
//
// The prompt IS the world. setPrompt hot-swaps land on the next chunk, so we
// treat the prompt as a live scene-graph + event channel composed from ordered
// slots. Each HUD toggle edits ITS slot and re-emits the merged prompt. Changing
// one slot at a time with a fixed seed minimises jarring morphs at chunk
// boundaries.

export interface SceneGraph {
  /** Base environment / theatre (from the seed image). */
  base: string;
  /** POV / altitude anchor — keeps movement reading as flight, not walking. */
  pov: string;
  /** Time-of-day cue. */
  timeOfDay: string;
  /** Weather / visibility cue. */
  weather: string;
  /** Dynamic injected targets / threats / events (God's-eye injection). */
  events: string[];
}

export interface PromptPreset {
  id: string;
  label: string;
  /** Which slot this preset writes. */
  slot: "pov" | "timeOfDay" | "weather";
  value: string;
}

export const POV_PRESETS: PromptPreset[] = [
  { id: "pov-chase", label: "Chase Cam (3P)", slot: "pov", value: "third-person chase camera following the drone from behind and slightly above, the UAV airframe visible in frame banking through the scene" },
  { id: "pov-high", label: "High Loiter", slot: "pov", value: "high-altitude aerial drone view looking down, wide reconnaissance framing" },
  { id: "pov-mid", label: "Patrol Alt", slot: "pov", value: "mid-altitude aerial drone FPV view, slight downward tilt, surveillance framing" },
  { id: "pov-low", label: "Low & Fast", slot: "pov", value: "low-altitude fast FPV drone view skimming the terrain, slight barrel distortion" },
  { id: "pov-topdown", label: "Top-Down", slot: "pov", value: "straight top-down nadir drone view, orthographic map-like framing" },
];

export const TOD_PRESETS: PromptPreset[] = [
  { id: "tod-day", label: "Midday", slot: "timeOfDay", value: "bright midday sun, hard shadows, clear visibility" },
  { id: "tod-dawn", label: "Dawn", slot: "timeOfDay", value: "soft dawn light, long shadows, cool low sun" },
  { id: "tod-dusk", label: "Dusk", slot: "timeOfDay", value: "golden-hour dusk light, warm orange sky, long shadows" },
  { id: "tod-night", label: "Night Ops", slot: "timeOfDay", value: "night operations, deep darkness, faint moonlight, scattered ground lights" },
  { id: "tod-ir", label: "IR / Thermal", slot: "timeOfDay", value: "monochrome thermal infrared sensor view, hot signatures glowing white, cold background" },
];

export const WEATHER_PRESETS: PromptPreset[] = [
  { id: "wx-clear", label: "Clear", slot: "weather", value: "clear skies, high visibility" },
  { id: "wx-fog", label: "Fog", slot: "weather", value: "thick low fog, reduced visibility, soft diffused light" },
  { id: "wx-rain", label: "Rain", slot: "weather", value: "heavy rain, wet surfaces, overcast grey sky, low contrast" },
  { id: "wx-sand", label: "Sandstorm", slot: "weather", value: "blowing sandstorm, ochre haze, drifting dust reducing visibility" },
  { id: "wx-wind", label: "High Wind", slot: "weather", value: "strong wind, swaying vegetation and blowing debris" },
  { id: "wx-snow", label: "Snow", slot: "weather", value: "falling snow, white-out conditions, muted cold palette" },
];

/** One-tap dynamic target / event injections (added to the events slot). */
export interface EventPreset {
  id: string;
  label: string;
  /** Threat class — drives the HUD marker styling. */
  kind: "vehicle" | "personnel" | "structure" | "naval" | "hazard";
  value: string;
}

export const EVENT_PRESETS: EventPreset[] = [
  { id: "ev-compound", label: "Enemy Compound", kind: "structure", value: "a fortified enemy compound with a perimeter wall and several outbuildings on the ground below" },
  { id: "ev-sam", label: "SAM Site", kind: "structure", value: "a camouflaged surface-to-air missile site with a radar dish and launch vehicles in a cleared emplacement" },
  { id: "ev-technical", label: "Technical", kind: "vehicle", value: "an armed technical pickup truck with a mounted heavy machine gun moving along the track below" },
  { id: "ev-section", label: "Foot Section", kind: "personnel", value: "a section of dismounted soldiers moving in file across open ground" },
  { id: "ev-convoy", label: "Supply Convoy", kind: "vehicle", value: "a supply convoy of military trucks raising dust along the road below" },
  { id: "ev-boat", label: "Patrol Boat", kind: "naval", value: "a fast patrol boat cutting a white wake across the water" },
  { id: "ev-artillery", label: "Artillery", kind: "structure", value: "a dug-in artillery position with towed howitzers and earth revetments" },
  { id: "ev-ied", label: "IED / Crater", kind: "hazard", value: "a fresh blast crater and disturbed earth marking a roadside IED on the route below" },
];

/**
 * Persistence / anti-morph anchor — ALWAYS appended (playbook §4.4 stability tip
 * + the seed-repro finding in scripts/stress/accuracy_seed.py and the official
 * LingBot guidance on long-term spatial memory at https://lingbot-world.com).
 *
 * LingBot keeps coherent spatial memory but a hot-swapped prompt is the main
 * lever that can fight it: re-emitting churned wording at chunk boundaries makes
 * geometry/architecture warp. Pairing a FIXED seed with a stable, repeated
 * persistence clause holds the world together. Phrased positively (LingBot does
 * not reliably honour negatives) and kept identical run-to-run so the composed
 * prompt only changes when the operator MEANINGFULLY changes a slot.
 */
const STABILITY_CUES =
  "a single coherent persistent world, the same location throughout, " +
  "stable consistent geometry and architecture, temporally stable, locked layout, no morphing";

/** Higher-fidelity look cues appended when ENHANCE is on (kept separate from the
 * always-on stability anchor so quality never fights consistency). */
const QUALITY_CUES =
  "photoreal, cinematic, high dynamic range, sharp sensor optics, volumetric atmosphere";

export function newSceneGraph(base: string): SceneGraph {
  return {
    base,
    pov: POV_PRESETS[1].value, // Patrol Alt default — reads as flight
    timeOfDay: "",
    weather: "",
    events: [],
  };
}

/**
 * Compose the layered scene-graph into a single LingBot prompt string.
 * Order: base → POV/altitude → time-of-day → weather → dynamic events →
 * quality(enhance) → persistence anchor.
 *
 * The persistence anchor (and quality cues) form a fixed TAIL that is budgeted
 * first so that, if the 1000-char LingBot cap is hit, only the variable body
 * (events first) is trimmed — the anti-morph anchor is never truncated away.
 */
export function composePrompt(g: SceneGraph, enhance: boolean): string {
  const tail: string[] = [];
  if (enhance) tail.push(QUALITY_CUES);
  tail.push(STABILITY_CUES);
  const tailStr = tail.join(". ");

  const body: string[] = [];
  if (g.base.trim()) body.push(g.base.trim());
  if (g.pov.trim()) body.push(g.pov.trim());
  if (g.timeOfDay.trim()) body.push(g.timeOfDay.trim());
  if (g.weather.trim()) body.push(g.weather.trim());
  for (const ev of g.events) if (ev.trim()) body.push(ev.trim());
  let bodyStr = body.join(". ");

  const sep = bodyStr ? ". " : "";
  // LingBot caps prompts at 1000 chars — protect the tail anchor.
  const maxBody = 1000 - (tailStr.length + sep.length);
  if (bodyStr.length > maxBody) {
    bodyStr = maxBody > 3 ? bodyStr.slice(0, maxBody - 3) + "..." : "";
  }
  return bodyStr ? `${bodyStr}${sep}${tailStr}` : tailStr;
}
