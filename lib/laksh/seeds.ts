// Laksh mission-start seed images (the "reference" rail).
//
// Curated UAV / aerial / defence seed frames saved at public/references/laksh/.
// Mirrors public/references/laksh/manifest.json. Each ships a suggested LingBot
// prompt used as the scene-graph BASE slot on selection.

export interface LakshSeed {
  id: string;
  filename: string;
  label: string;
  src: string;
  /** Suggested LingBot base prompt for this theatre. */
  promptSeed: string;
  theme: string;
}

const base = "/references/laksh";

export const LAKSH_SEEDS: LakshSeed[] = [
  {
    id: "aerial-coastal-recon",
    filename: "aerial-coastal-recon.jpg",
    label: "Coastal Recon — Top-Down",
    src: `${base}/aerial-coastal-recon.jpg`,
    promptSeed:
      "A UAV holds a top-down hover over a tropical shoreline, surf breaking against pale sand as it scans the coastline for movement.",
    theme: "aerial/coastal drone POV",
  },
  {
    id: "aerial-desert-dunes",
    filename: "aerial-desert-dunes.jpg",
    label: "Desert Dunes — Aerial",
    src: `${base}/aerial-desert-dunes.jpg`,
    promptSeed:
      "A reconnaissance drone glides low over endless rolling sand dunes at golden hour, tracking faint tracks across the open desert.",
    theme: "desert terrain",
  },
  {
    id: "desert-mesa-overwatch",
    filename: "desert-mesa-overwatch.jpg",
    label: "Desert Mesa — Overwatch",
    src: `${base}/desert-mesa-overwatch.jpg`,
    promptSeed:
      "A UAV patrols a wide arid valley of red rock buttes and mesas, maintaining overwatch across the open desert basin.",
    theme: "desert terrain / surveillance",
  },
  {
    id: "mountain-ridge-aerial",
    filename: "mountain-ridge-aerial.jpg",
    label: "Coastal Fjord Ridge — Aerial",
    src: `${base}/mountain-ridge-aerial.jpg`,
    promptSeed:
      "A drone climbs along a steep coastal mountain ridge at sunrise, a narrow fjord glinting far below between jagged peaks.",
    theme: "mountain/coastal terrain from above",
  },
  {
    id: "foggy-valley",
    filename: "foggy-valley.jpg",
    label: "Foggy Valley — Layered Ridges",
    src: `${base}/foggy-valley.jpg`,
    promptSeed:
      "A UAV drifts through hazy light over layered forested ridgelines, scanning a mist-filled valley for thermal signatures.",
    theme: "foggy scene",
  },
  {
    id: "misty-cliff-corridor",
    filename: "misty-cliff-corridor.jpg",
    label: "Misty Cliff Corridor",
    src: `${base}/misty-cliff-corridor.jpg`,
    promptSeed:
      "A drone follows a winding mountain road through a misty cliff corridor at dawn, tracing the route as fog rolls over the escarpment.",
    theme: "foggy / route surveillance",
  },
  {
    id: "above-the-clouds",
    filename: "above-the-clouds.jpg",
    label: "Above The Clouds — Alpine",
    src: `${base}/above-the-clouds.jpg`,
    promptSeed:
      "A high-altitude UAV cruises above a sea of clouds at dusk, snow peaks piercing the inversion layer along the horizon.",
    theme: "open sky / high altitude",
  },
  {
    id: "night-city-surveillance",
    filename: "night-city-surveillance.jpg",
    label: "Night City — Surveillance",
    src: `${base}/night-city-surveillance.jpg`,
    promptSeed:
      "A UAV loiters over a sprawling city grid at night, its sensor sweeping the glittering streets and skyline below.",
    theme: "urban surveillance / night",
  },
  {
    id: "aerial-forest-lake",
    filename: "aerial-forest-lake.jpg",
    label: "Forest & Lake — Top-Down",
    src: `${base}/aerial-forest-lake.jpg`,
    promptSeed:
      "A drone scans straight down over the boundary where dense forest meets a turquoise lake, mapping the treeline edge.",
    theme: "aerial drone POV terrain",
  },
  {
    id: "urban-coastal-overhead",
    filename: "urban-coastal-overhead.jpg",
    label: "Coastal City — Overhead",
    src: `${base}/urban-coastal-overhead.jpg`,
    promptSeed:
      "A high UAV passes over a coastal city and its offshore developments, surveying the waterfront installations and marina below.",
    theme: "urban surveillance / coastal installation",
  },
  {
    id: "night-sky-horizon",
    filename: "night-sky-horizon.jpg",
    label: "Night Sky — Open Horizon",
    src: `${base}/night-sky-horizon.jpg`,
    promptSeed:
      "A UAV hovers under a vast star-filled sky over dark silhouetted hills, holding a quiet night watch on the horizon.",
    theme: "night / open sky horizon",
  },
  {
    id: "airfield-dusk",
    filename: "airfield-dusk.jpg",
    label: "Airfield — Dusk Standby",
    src: `${base}/airfield-dusk.jpg`,
    promptSeed:
      "A drone taxis past an aircraft parked on a deserted airfield apron at dusk, the runway stretching into the low sun.",
    theme: "airfield / installation",
  },
];
