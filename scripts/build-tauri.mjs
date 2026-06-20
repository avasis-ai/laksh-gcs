#!/usr/bin/env node
/**
 * Static-export build for the Tauri desktop target.
 *
 * Next.js `output: "export"` cannot compile dynamic Route Handlers (our
 * `POST /api/reactor/token` is `force-dynamic`). The desktop app doesn't use
 * those routes at all — it calls the Rust commands instead — so we temporarily
 * move `app/api` out of the tree, run the export, then always restore it.
 *
 * This keeps the web build (`pnpm build`) completely untouched: it still ships
 * the server app with its API routes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "app", "api");
const stashDir = join(root, ".tauri-build-stash");
const stashedApi = join(stashDir, "api");

let stashed = false;
if (existsSync(apiDir)) {
  rmSync(stashDir, { recursive: true, force: true });
  mkdirSync(stashDir, { recursive: true });
  renameSync(apiDir, stashedApi);
  stashed = true;
  console.log("[build:tauri] Temporarily moved app/api out for static export.");
}

function restore() {
  if (stashed && existsSync(stashedApi)) {
    renameSync(stashedApi, apiDir);
    rmSync(stashDir, { recursive: true, force: true });
    console.log("[build:tauri] Restored app/api.");
  }
}

// Restore even if the build process is interrupted.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    restore();
    process.exit(1);
  });
}

let code = 1;
try {
  const result = spawnSync("pnpm", ["exec", "next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_TAURI: "1" },
  });
  code = result.status ?? 1;
} finally {
  restore();
}

process.exit(code);
