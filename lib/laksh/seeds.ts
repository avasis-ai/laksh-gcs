// Laksh DEFENCE MISSION seed images (the mission rail).
//
// Each entry is a named defence mission built on a seed frame saved at
// public/references/laksh/ and mirrored in manifest.json. Selecting a mission
// loads its seed image AND writes its base promptSeed into the scene-graph BASE
// slot (and an optional POV override). All theatres are FICTIONAL training
// worlds (AI-generated / stock), not depictions of real operations.
//
// Prompt discipline (docs/research/world-consistency.md): each promptSeed names
// the theatre and reinforces a SINGLE consistent location; the always-on
// persistence anchor in scene.ts (composePrompt) carries the heavy anti-morph
// phrasing so base prompts stay concise and within the 1000-char LingBot cap.

import { POV_PRESETS } from "./scene";

export interface LakshSeed {
  id: string;
  filename: string;
  /** Mission codename + theatre, shown as the rail label. */
  label: string;
  src: string;
  /** Suggested LingBot base prompt for this theatre. */
  promptSeed: string;
  theme: string;
  /** One-line mission objective/brief surfaced in the tasking rail. */
  brief?: string;
  /**
   * Optional POV slot override applied when this seed is selected. Used by
   * missions whose framing is fixed (e.g. third-person chase cam) so the
   * default first-person POV preset doesn't fight the base prompt.
   */
  pov?: string;
}

const base = "/references/laksh";

/** Look up a POV preset value by id (keeps mission POVs in sync with scene.ts). */
const pov = (id: string): string => POV_PRESETS.find((p) => p.id === id)!.value;

export const LAKSH_SEEDS: LakshSeed[] = [
  // ── Flagship ─────────────────────────────────────────────────────────────
  {
    id: "operation-sindoor-kashmir",
    filename: "operation-sindoor-kashmir.jpg",
    label: "OP SINDOOR — Kashmir High Recon",
    src: `${base}/operation-sindoor-kashmir.jpg`,
    promptSeed:
      "Third-person chase camera following a sleek matte-grey Indian reconnaissance UAV from behind and slightly above as it banks through the same snow-capped Himalayan range over Kashmir, golden-hour alpine light, frozen ridgelines and pine forests dusted with snow far below, clouds clinging to the summits, one continuous mountain theatre.",
    theme: "Op Sindoor / high-altitude mountain ISR (3rd-person)",
    brief: "ISR sweep of the high passes; cue ground teams onto infiltration routes.",
    pov: pov("pov-chase"),
  },
  // ── Historical theatres (representational training worlds) ─────────────────
  {
    id: "mission-uri-loc-night",
    filename: "mission-uri-loc-night.jpg",
    label: "URI 2016 — LoC Night Recon",
    src: `${base}/mission-uri-loc-night.jpg`,
    promptSeed:
      "A reconnaissance UAV holds a low-light orbit over the same moonlit pine-forested Himalayan ridgelines along a tense frontier, a single infiltration trail winding along the ridge toward a small cluster of crude structures in a clearing, cold blue night and low valley mist, one continuous mountain sector.",
    theme: "cross-frontier night ISR / launch-pad recon",
    brief: "Mark infiltration routes and launch-pad clusters along the ridge for the raid teams.",
    pov: pov("pov-high"),
  },
  {
    id: "mission-balakot-jaba-dawn",
    filename: "mission-balakot-jaba-dawn.jpg",
    label: "BALAKOT 2019 — Jaba Top BDA",
    src: `${base}/mission-balakot-jaba-dawn.jpg`,
    promptSeed:
      "A reconnaissance UAV holds a high pre-dawn orbit over the same isolated walled hilltop compound set among dense pine forest in mountainous terrain, low buildings inside the perimeter, mist clinging to the valleys and first light on distant peaks, one fixed objective.",
    theme: "deep-strike target ID / pre-dawn hilltop BDA",
    brief: "Pre-strike target identification and post-strike battle-damage assessment of the hilltop compound.",
    pov: pov("pov-high"),
  },
  // ── New defence theatres (6 mission seed frames) ───────────────────────────
  {
    id: "mission-border-fence-dusk",
    filename: "mission-border-fence-dusk.jpg",
    label: "SENTINEL LINE — Border Interdiction",
    src: `${base}/mission-border-fence-dusk.jpg`,
    promptSeed:
      "A surveillance UAV patrols along a single fixed lit border-security fence at dusk, floodlit watchtowers and a dirt patrol road tracing the same boundary across dark desert scrub, a distant forward base glowing on the horizon, one continuous border sector.",
    theme: "border surveillance / interdiction",
    brief: "Detect and track illegal crossings and tunnelling along the fence line.",
    pov: pov("pov-mid"),
  },
  {
    id: "mission-fob-overwatch",
    filename: "mission-fob-overwatch.jpg",
    label: "IRON BASTION — FOB Overwatch",
    src: `${base}/mission-fob-overwatch.jpg`,
    promptSeed:
      "A UAV holds a high orbit over a single fixed forward operating base in arid mountains, HESCO blast walls and a guard tower ringing parked armoured vehicles and a marked helipad, a river valley winding past the same compound, one persistent installation.",
    theme: "forward operating base / overwatch",
    brief: "Maintain overwatch of the FOB perimeter and screen the approach roads.",
    pov: pov("pov-high"),
  },
  {
    id: "mission-naval-interdiction",
    filename: "mission-naval-interdiction.jpg",
    label: "TRIDENT WATCH — Naval Interdiction",
    src: `${base}/mission-naval-interdiction.jpg`,
    promptSeed:
      "A maritime patrol UAV shadows a grey naval frigate cutting a long white wake across a cold open sea, a second warship holding station on the horizon under an overcast sky, the same stretch of ocean throughout.",
    theme: "maritime patrol / naval interdiction",
    brief: "Shadow and identify the surface contact; enforce the exclusion zone.",
    pov: pov("pov-mid"),
  },
  {
    id: "mission-urban-ct-night",
    filename: "mission-urban-ct-night.jpg",
    label: "NIGHT TALON — Urban CT",
    src: `${base}/mission-urban-ct-night.jpg`,
    promptSeed:
      "A surveillance UAV loiters over a single dense low-rise urban district at night, sodium-lit streets and packed flat-roofed blocks below, vehicles threading the same intersection, one fixed neighbourhood held under watch.",
    theme: "urban counter-terror / night ISR",
    brief: "Top cover for the cordon-and-search; track squirters off the objective.",
    pov: pov("pov-high"),
  },
  {
    id: "mission-convoy-escort",
    filename: "mission-convoy-escort.jpg",
    label: "DUST CARAVAN — Convoy Escort",
    src: `${base}/mission-convoy-escort.jpg`,
    promptSeed:
      "A low chase UAV escorts a military convoy of armoured trucks and MRAPs raising dust along a single desert track at golden hour, the same open arid plain and scrub stretching to the horizon, one continuous route.",
    theme: "convoy escort / route security",
    brief: "Escort the convoy; screen the route ahead for ambush and IEDs.",
    pov: pov("pov-low"),
  },
  // ── Kept aerials, reframed as defence ISR theatres ─────────────────────────
  {
    id: "desert-mesa-overwatch",
    filename: "desert-mesa-overwatch.jpg",
    label: "RED MESA — Desert Overwatch",
    src: `${base}/desert-mesa-overwatch.jpg`,
    promptSeed:
      "A UAV maintains overwatch across one wide arid valley of red rock buttes and mesas, the same open desert basin and dirt tracks below, holding a steady reconnaissance orbit.",
    theme: "desert overwatch / surveillance",
    brief: "Screen the basin and tracks for movement and dust signatures.",
    pov: pov("pov-high"),
  },
  {
    id: "foggy-valley",
    filename: "foggy-valley.jpg",
    label: "GREY VEIL — Valley Recon",
    src: `${base}/foggy-valley.jpg`,
    promptSeed:
      "A UAV drifts over the same layered forested ridgelines through hazy light, scanning one mist-filled valley for thermal signatures and concealed movement, a single continuous terrain sector.",
    theme: "low-visibility valley recon",
    brief: "Thermal sweep of the valley for concealed contacts and caches.",
    pov: pov("pov-mid"),
  },
  {
    id: "above-the-clouds",
    filename: "above-the-clouds.jpg",
    label: "HIGH GUARD — High-Altitude CAP",
    src: `${base}/above-the-clouds.jpg`,
    promptSeed:
      "A high-altitude UAV holds a combat air patrol above the same sea of clouds at dusk, snow peaks piercing the inversion layer along the horizon, one continuous high-altitude track.",
    theme: "high-altitude combat air patrol",
    brief: "Hold high-altitude CAP; maintain wide-area awareness over the sector.",
    pov: pov("pov-high"),
  },
  {
    id: "night-city-surveillance",
    filename: "night-city-surveillance.jpg",
    label: "CITY EYES — Metro Surveillance",
    src: `${base}/night-city-surveillance.jpg`,
    promptSeed:
      "A UAV loiters over the same sprawling city grid at night, its sensor sweeping one fixed expanse of glittering streets and skyline below, a single persistent metropolitan sector.",
    theme: "urban metro surveillance / night",
    brief: "Persistent metro surveillance; flag pattern-of-life anomalies.",
    pov: pov("pov-high"),
  },
];
