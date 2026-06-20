// Curated seed images and prompt presets for the LingBot dashboard.
// Each reference ships a default prompt so a single click is enough to walk
// into a world. Images live in /public/references and are real JPEGs so they
// can be uploaded to the model as seed frames.

export interface ReferenceScene {
  id: string;
  label: string;
  src: string;
  prompt: string;
}

export const REFERENCE_SCENES: ReferenceScene[] = [
  {
    id: "forest",
    label: "Old-growth forest",
    src: "/references/forest.jpg",
    prompt:
      "A misty old-growth forest at dawn, shafts of soft golden light through tall pines, damp earth and ferns, cinematic, photorealistic.",
  },
  {
    id: "mountain",
    label: "Alpine ridge",
    src: "/references/mountain.jpg",
    prompt:
      "A high alpine ridge above the clouds, snow-dusted granite peaks, crisp clear air, dramatic morning light, photorealistic.",
  },
  {
    id: "desert",
    label: "Desert dunes",
    src: "/references/desert.jpg",
    prompt:
      "Vast rolling desert dunes at golden hour, wind-rippled sand, long shadows, warm amber light, cinematic wide shot.",
  },
  {
    id: "city",
    label: "Rain-lit street",
    src: "/references/city.jpg",
    prompt:
      "A neon-lit city street at night after rain, glistening pavement, reflections, shallow puddles, moody cinematic atmosphere.",
  },
  {
    id: "ocean",
    label: "Coastal cliffs",
    src: "/references/ocean.jpg",
    prompt:
      "Rugged coastal cliffs over a turquoise sea, rolling surf, sea spray, bright midday sun, photorealistic.",
  },
];

// Live "atmosphere" prompts that can be hot-swapped mid-stream via set_prompt.
export interface AtmosphereEvent {
  id: string;
  label: string;
  suffix: string;
}

export const ATMOSPHERE_EVENTS: AtmosphereEvent[] = [
  { id: "rain", label: "Rain", suffix: "Heavy rain begins to fall, wet surfaces, overcast sky." },
  { id: "fog", label: "Fog", suffix: "A thick fog rolls in, low visibility, soft diffused light." },
  { id: "sunset", label: "Sunset", suffix: "The sun sinks low, warm orange and pink sky, long shadows." },
  { id: "night", label: "Night", suffix: "Night falls, deep blue darkness, moonlight and faint stars." },
  { id: "snow", label: "Snow", suffix: "Gentle snowfall, a fresh white blanket over everything." },
];

/** Prepend cinematic quality cues when ENHANCE is on. */
export function enhancePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;
  const cues =
    "ultra-detailed, photorealistic, cinematic lighting, volumetric atmosphere, 35mm, high dynamic range";
  return `${trimmed} — ${cues}`;
}
