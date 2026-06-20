# Reactor Studio — LingBot Dashboard

A custom dashboard for **Reactor LingBot**: action-controlled, real-time
navigable world generation. Pick a seed image, describe a scene, hit
**Generate**, then walk through an infinite world with WASD + look controls —
all streamed over WebRTC with sub-1s latency.

Built on [Reactor](https://reactor.inc) (`@reactor-models/lingbot` +
`@reactor-team/js-sdk`), Next.js 16 (App Router), React 19, and Tailwind CSS 4.

---

## Architecture

```
Browser (this app)                Next.js server (this app)         Reactor
┌────────────────────┐  POST      ┌──────────────────────────┐  POST  ┌──────────────┐
│ LingbotProvider    │  /token    │ /api/reactor/token        │──────▶ │ POST /tokens │
│  getJwt ───────────┼──────────▶ │  mints short-lived JWT    │        └──────────────┘
│ Studio controller  │            │  (REACTOR_API_KEY secret) │
│ WASD / look / clip │            │ /api/reactor/pricing      │──────▶  GET /pricing
└─────────┬──────────┘            │ /api/reactor/health       │
          │ JWT                   └──────────────────────────┘
          ▼
   @reactor-team/js-sdk ──── WebRTC ────▶ GPU / lingbot model
```

The API key **never** reaches the browser. The client only ever receives a
short-lived JWT minted server-side.

### Backend (`app/api/reactor/*`, `lib/reactor/server.ts`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/reactor/token` | `POST` | Exchange `REACTOR_API_KEY` for a short-lived JWT |
| `/api/reactor/pricing` | `GET` | Proxy the public pricing table (cached 60s) |
| `/api/reactor/health` | `GET` | Validate credentials without exposing the key |

`lib/reactor/server.ts` is the only place the API key is read (guarded by
`server-only`). It mints tokens, fetches+caches pricing, and normalizes errors.

### Frontend (`components/*`)

- **`ReactorDashboard`** — mounts `LingbotProvider` (JWT resolver + no auto-connect) and the studio state controller.
- **`StudioProvider`** — orchestrates the full lifecycle: `connect → uploadFile → setImage → (await image_accepted) → setPrompt → start`, plus history, atmosphere hot-swaps, and live control wiring.
- **`Sidebar`** — references, prompt composer with ENHANCE toggle, history.
- **`Viewport`** — live `main_video`, empty/loading states, status toolbar, clip recorder.
- **`Controls`** — persistent WASD movement, look (yaw/pitch), rotation-speed slider. Driven by both on-screen keycaps and physical keyboard.

---

## Getting started

```bash
# 1. Configure your key (already set in .env.local for this workspace)
cp .env.example .env.local
#   then edit REACTOR_API_KEY=rk_...

# 2. Install + run
pnpm install
pnpm dev
```

Open the printed URL. Pick a reference image, tweak the prompt, hit
**Generate**, and use WASD / arrow keys (or the on-screen pads) to move.

---

## Usage notes

- **Billing** starts only once a session reaches `ready` (connected to a GPU).
  The app connects on **Generate** — not on load — so idle time is free.
  Use the power button in the toolbar to stop a session and halt billing.
- **Clips**: the scissors button grabs the last 10s; the dropdown offers 30s
  or a full recording, downloaded as MP4.
- **Atmosphere**: while a world is live, the chips at the top of the viewport
  hot-swap weather/time-of-day into the prompt via `set_prompt`.
- **ENHANCE** appends cinematic quality cues to your prompt before sending.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Lint |
