---
version: alpha
name: Laksh GCS
description: >-
  Design language for Laksh — CelesticLabs' real-time UAV World-Model Ground
  Control Station. A calm, legible MISSION-CONTROL console: near-black tactical
  surfaces, restrained glass, phosphor-green telemetry, amber caution, red
  alert, monospace numerics. Built on the Reactor LingBot prototype, evolved for
  defence / UAV operations. One committed point of view — refined, never
  genericised.

colors:
  # Base surfaces — near-black, slightly green-shifted (not pure neutral)
  background: "#0a0e0d"        # app shell
  surface: "#111614"           # standard panel fill
  surface-muted: "#161d1a"     # inset fields / wells
  surface-raised: "#1b2421"    # raised controls
  viewport: "#050706"          # the live feed letterbox
  # Glass — restrained translucency for docked panels over the shell
  glass: "rgba(15, 20, 18, 0.72)"
  glass-strong: "rgba(9, 13, 12, 0.80)"
  # Text
  foreground: "#e6efe9"        # primary text — AA on all surfaces
  muted: "#9aada4"             # secondary text (raised to meet AA on surface)
  faint: "#5a6b63"             # tertiary / disabled — non-essential only
  label: "#7d9389"             # mono labels (raised from #6f8278 for AA)
  # Lines
  border: "#1f2a26"            # hairline divider
  border-strong: "#2c3b35"     # emphasised hairline / control edge
  # Phosphor-green primary accent (HUD + ARM action)
  accent: "#2fe08a"
  accent-hover: "#43e898"
  accent-active: "#25c476"
  accent-foreground: "#03130b" # text on accent fill
  accent-soft: "#0f231a"       # tinted well behind active states
  # Instrument signal colours (status semantics — never decorative)
  hud: "#38e8a0"               # live phosphor readout
  hud-dim: "#1f7a55"           # idle / ladder ticks
  ready: "#f0a324"             # armed / standby (amber)
  caution: "#f0a324"           # warning
  danger: "#ff5252"            # alert (raised for AA on dark)
  good: "#2fe08a"              # nominal
  info: "#3da5ff"              # informational / naval

typography:
  font-sans: Geist
  font-mono: Geist Mono
  display:        { fontFamily: Geist,      fontSize: 24px, fontWeight: 300, letterSpacing: "-0.01em" }
  title:          { fontFamily: Geist,      fontSize: 14px, fontWeight: 600, letterSpacing: "0.02em" }
  body-md:        { fontFamily: Geist,      fontSize: 13px, fontWeight: 400, lineHeight: 1.5 }
  body-sm:        { fontFamily: Geist,      fontSize: 12px, fontWeight: 400, lineHeight: 1.45 }
  caption:        { fontFamily: Geist,      fontSize: 11px, fontWeight: 400 }
  label-mono:     { fontFamily: Geist Mono, fontSize: 10px, fontWeight: 500, letterSpacing: "0.16em", textTransform: uppercase }
  telemetry:      { fontFamily: Geist Mono, fontSize: 15px, fontWeight: 600, fontVariantNumeric: tabular-nums }
  telemetry-sm:   { fontFamily: Geist Mono, fontSize: 11px, fontWeight: 500, fontVariantNumeric: tabular-nums }

spacing:
  # Rhythm is mostly 4px-based, with deliberate off-grid steps (6/10/14/18)
  # where dense instrument panels read better than a rigid 4px multiple.
  hair: 2px
  xs: 6px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 24px
  rail: 296px        # left + right console rails
  cmdbar: 44px       # top command bar height

rounded:
  field: 7px
  card: 9px
  panel: 11px
  pill: 999px

elevation:
  # Restrained: hairline + thin shadow + faint inner top highlight.
  # NO soft coloured glow on panels — glow is reserved for live HUD signal.
  e0: "none"
  e1: "0 1px 2px rgba(0,0,0,0.40)"
  e2: "0 4px 16px rgba(0,0,0,0.45)"
  inset-top: "inset 0 1px 0 rgba(255,255,255,0.04)"
  blur-sm: "blur(8px)"
  blur-md: "blur(14px) saturate(1.08)"

motion:
  # Tuned easings — not transition-all. Always pair with :active + reduced-motion.
  fast: "120ms"
  base: "180ms"
  slow: "320ms"
  ease-out: "cubic-bezier(0.22, 1, 0.36, 1)"
  ease-standard: "cubic-bezier(0.4, 0, 0.2, 1)"

components:
  panel:
    background: "{colors.glass}"
    border: "1px solid {colors.border}"
    borderRadius: "{rounded.panel}"
    boxShadow: "{elevation.e1}"
    backdropFilter: "{elevation.blur-md}"
  command-bar:
    background: "{colors.glass-strong}"
    height: "{spacing.cmdbar}"
    borderBottom: "1px solid {colors.border}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    borderRadius: "{rounded.field}"
  readout:
    color: "{colors.hud}"
    fontFamily: Geist Mono
    textShadow: "0 0 8px rgba(47,224,138,0.35)"
---

# Laksh GCS — Design Language

## Overview

Laksh is a **monitoring room, not a video game**. The operator watches a live
generative world-model feed and tasks it. The interface must read instantly,
hold a calm baseline, and escalate visually only when the mission state changes.
Everything is an intentional token; nothing is a framework default.

The console has four zones that never move (spatial memory):

1. **Command bar** (top) — system identity + state-of-truth: callsign `LAKSH`,
   system state (`OFFLINE / ARMED / LIVE / PAUSED`), session clock, datalink.
2. **Tasking rail** (left) — inputs: mission seed, scene-graph, target injection.
3. **World feed** (center) — the video with spatial HUD (horizon, compass,
   reticle, minimap) and flight controls.
4. **Monitoring rail** (right) — outputs/telemetry: link & session/cost,
   flight telemetry readout, active targets, mission log.

Left = what the operator *commands*. Right = what the system *reports*.

## Colors

Single committed identity: **near-black green-shifted tactical surfaces + a
phosphor-green primary accent**, with amber caution / red alert / blue info as
strict status semantics. There is **no purple/indigo/violet anywhere** and no
gradient text — the 200–290° hue band is banned. Accent and signal colours
carry *meaning* (live, armed, warning, alert); they are never used for
decoration. Most of the UI is greyscale tactical; colour is the exception that
draws the eye to state.

Contrast is measured, not assumed: `foreground` (#e6efe9) and `muted` (#9aada4)
both clear WCAG AA on every surface token; `faint` is reserved for non-essential
hints only. `danger` was raised to #ff5252 and `label` to #7d9389 to pass AA.

## Typography

Geist for prose and chrome; **Geist Mono for every number and instrument
label** — telemetry, RTT/FPS, clocks, headings, coordinates. Monospace +
`tabular-nums` keeps glanceable readouts from shifting width as values change.
`.label-mono` (10px, 0.16em tracking, uppercase) is the connective tissue of the
console. The phosphor `.hud-readout` glow is the only place a colour glow is
allowed — it signals a *live* value.

## Layout

Fixed rails (`296px`) flank a fluid feed; a `44px` command bar caps the shell.
Rhythm is 4px-based with deliberate off-grid steps (6/10/14/18px) inside dense
panels. Below `1280px` the right monitoring rail collapses (its critical data —
link quality, alerts — remains available as feed overlays), the feed and left
rail keep working. No centred marketing hero, no equal 3-card grids — panels are
sized to their data.

## Elevation & Depth

Depth comes from **layering + hairlines + one thin shadow**, not glow. Glass
panels use a real `backdrop-filter` blur over the textured shell with a crisp
1px border and a faint inner top highlight — restrained, legible, never a
floating frosted glow-card. A single hairline grid texture sits *behind* panels
at ~3% to suggest a tactical surface; it is never layered on top of content.

## Shapes

Radii are tight and consistent: fields `7px`, cards `9px`, panels `11px`, pills
fully round. Markers and instrument geometry stay angular (diamonds, ticks,
boresight) — the tactical signature.

## Components

- **Panel** — the glass container primitive for every docked module. Title is
  `.label-mono`; body is `body-sm`/telemetry.
- **Command-bar chip** — compact status token with a state dot + mono label.
- **Telemetry readout** — mono value + small unit, phosphor when live, dim when
  standby.
- **Tac-chip / pill / keycap / range** — existing tactical controls, retained.

## Do's and Don'ts

**Do**
- Keep one accent for primary action (ARM FEED) and let status colours mean status.
- Use Geist Mono + tabular-nums for all numerics.
- Tune real easings; include `:active` feedback and honour `prefers-reduced-motion`.
- Size panels to their content; prefer restraint over density.

**Don't**
- No purple/indigo gradients, no gradient text, no glow-card glassmorphism.
- No `transition-all`, no emoji icons, no Inter, no generic equal-card grids.
- Don't invent telemetry — surface only real session/flight/stats data.
- Don't pile HUD overlays onto the feed; route reporting to the right rail.
