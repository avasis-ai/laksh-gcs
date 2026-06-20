"use client";

import { useEffect, useState } from "react";

import type { FlightState } from "@/lib/laksh/flightModel";
import { INITIAL_FLIGHT } from "@/lib/laksh/flightModel";
import { useStudio } from "../StudioProvider";

/**
 * Subscribe to the 60Hz client-side flight prediction. Components using this
 * re-render in step with the prediction loop (eased, decoupled from the 16fps
 * video) so the HUD reacts to INPUT instantly (playbook §4.2.4).
 */
export function useFlight(): FlightState {
  const { subscribeFlight } = useStudio();
  const [snap, setSnap] = useState<FlightState>(INITIAL_FLIGHT);
  useEffect(() => subscribeFlight(setSnap), [subscribeFlight]);
  return snap;
}
