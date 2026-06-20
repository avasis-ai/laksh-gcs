"use client";

import { LingbotProvider } from "@reactor-models/lingbot";

import { fetchJwt } from "@/lib/reactor/client";
import { Controls } from "./Controls";
import { Sidebar } from "./Sidebar";
import { StudioProvider } from "./StudioProvider";
import { Viewport } from "./Viewport";

/**
 * Root of the dashboard. Mounts the LingBot SDK provider with a server-minted
 * JWT resolver, then the studio state controller, then the layout.
 *
 * `autoConnect` is intentionally off — connection is established on demand
 * when the user hits Generate, which keeps `connecting`/`waiting` free and
 * avoids billing for idle sessions.
 */
export function ReactorDashboard() {
  return (
    <LingbotProvider getJwt={fetchJwt} connectOptions={{ autoConnect: false, maxAttempts: 8 }}>
      <StudioProvider>
        <div className="flex h-full w-full">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col gap-3 p-3">
            <Viewport />
            <Controls />
          </main>
        </div>
      </StudioProvider>
    </LingbotProvider>
  );
}
