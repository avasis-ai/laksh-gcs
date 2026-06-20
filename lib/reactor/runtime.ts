/**
 * Runtime transport detection for the Reactor integration.
 *
 * The same frontend serves two targets:
 *   - Web (browser): talks to the Next.js API routes under /api/reactor/*,
 *     which hold the secret REACTOR_API_KEY server-side.
 *   - Desktop (Tauri): talks to native Rust commands via `invoke(...)`, which
 *     hold the secret in the Rust process. The key is NEVER in the JS bundle.
 *
 * Detection is purely runtime (Tauri v2 injects `__TAURI_INTERNALS__` on the
 * webview's `window`), so a single static export works in both contexts.
 */

interface TauriWindow {
  __TAURI_INTERNALS__?: unknown;
}

/** True only when running inside the Tauri webview. */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as TauriWindow).__TAURI_INTERNALS__ !== "undefined"
  );
}

/**
 * Invoke a Rust command. The `@tauri-apps/api` module is imported dynamically
 * so the web build never has to resolve/ship it at the top level and tree-shakes
 * it out of the browser path.
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}
