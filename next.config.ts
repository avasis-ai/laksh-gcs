import type { NextConfig } from "next";

// Desktop (Tauri) builds set NEXT_PUBLIC_TAURI=1. In that mode we emit a fully
// static export into `out/` for Tauri to load from disk — there is no Node
// server in the desktop app, and the secret API key lives in the Rust backend
// (invoked via Tauri commands), so the /api/reactor/* routes are not needed.
// The normal web build leaves `output` undefined and keeps its API routes.
const isTauri = process.env.NEXT_PUBLIC_TAURI === "1";

const nextConfig: NextConfig = {
  // The Reactor SDK manages a single WebRTC connection. React StrictMode's
  // double-mount races the SDK's connect/disconnect lifecycle, so we disable
  // it to keep the realtime session stable (documented SDK gotcha).
  reactStrictMode: false,

  ...(isTauri
    ? {
        output: "export" as const,
        // Static export cannot use the Next image optimizer (no server).
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
