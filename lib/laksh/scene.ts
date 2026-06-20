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
  { id: "ev-convoy", label: "Convoy", kind: "vehicle", value: "a convoy of three military vehicles moving along the road below" },
  { id: "ev-contact", label: "Contact", kind: "personnel", value: "a small group of figures moving on foot across open ground" },
  { id: "ev-smoke", label: "Smoke", kind: "hazard", value: "thick black smoke rising from a compound" },
  { id: "ev-boat", label: "Boat Wake", kind: "naval", value: "a fast boat cutting a white wake across the water" },
  { id: "ev-compound", label: "Compound", kind: "structure", value: "a walled compound with several outbuildings below" },
  { id: "ev-aircraft", label: "Aircraft", kind: "vehicle", value: "another aircraft crossing in the distance" },
];

/** Quality cues appended when ENHANCE is on. */
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
 * Order: base → POV/altitude → time-of-day → weather → dynamic events → quality.
 */
export function composePrompt(g: SceneGraph, enhance: boolean): string {
  const parts: string[] = [];
  if (g.base.trim()) parts.push(g.base.trim());
  if (g.pov.trim()) parts.push(g.pov.trim());
  if (g.timeOfDay.trim()) parts.push(g.timeOfDay.trim());
  if (g.weather.trim()) parts.push(g.weather.trim());
  for (const ev of g.events) if (ev.trim()) parts.push(ev.trim());
  if (enhance) parts.push(QUALITY_CUES);
  let prompt = parts.join(". ");
  // LingBot caps prompts at 1000 chars.
  if (prompt.length > 1000) prompt = prompt.slice(0, 997) + "...";
  return prompt;
}
