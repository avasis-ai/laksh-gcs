"use client";

import { LingbotProvider } from "@reactor-models/lingbot";

import { fetchJwt } from "@/lib/reactor/client";
import { CommandBar } from "./CommandBar";
import { GcsViewport } from "./GcsViewport";
import { RightRail } from "./RightRail";
import { Sidebar } from "./Sidebar";
import { StudioProvider } from "./StudioProvider";

/**
 * Root of the Laksh Ground Control Station (CelesticLabs Pvt. Ltd.).
 *
 * Mounts the LingBot SDK provider with a server-minted JWT resolver, then the
 * GCS state controller (intent→primitive control layer + client-side flight
 * prediction), then the operator layout.
 *
 * `autoConnect` is intentionally off — the GPU link is armed on demand when the
 * operator hits ARM FEED, keeping `connecting`/`waiting` free and avoiding
 * billing for idle sessions (playbook §4.3).
 */
export function ReactorDashboard() {
  return (
    <LingbotProvider getJwt={fetchJwt} connectOptions={{ autoConnect: false, maxAttempts: 8 }}>
      <StudioProvider>
        <div className="deck-grid flex h-full w-full flex-col">
          <CommandBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col p-2.5">
              <GcsViewport />
            </main>
            <RightRail />
          </div>
        </div>
      </StudioProvider>
    </LingbotProvider>
  );
}
