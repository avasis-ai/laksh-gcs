import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Reactor SDK manages a single WebRTC connection. React StrictMode's
  // double-mount races the SDK's connect/disconnect lifecycle, so we disable
  // it to keep the realtime session stable (documented SDK gotcha).
  reactStrictMode: false,
};

export default nextConfig;
