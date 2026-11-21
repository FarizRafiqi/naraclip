# Channel 2 Design Direction (`@naraclip/remotion`)

## Design Read
60-second vertical technical explainer for beginner-to-intermediate developers, in a **Tactile Industrial Editorial / Swiss Technical Print** style.

Dial: ENERGY 3 / RHYTHM 3 / MOTION 3

## Purpose Statements (Anti-Slop Filter Gates)
- **Dual Theme (`paper` & `ink`)**: Archival warm paper (`#F4EFE6`) makes mechanical diagrams, cutaways, and typography feel printed and tactile rather than default dark-mode "tech". Matte charcoal ink (`#121820`) gives Code Plates and Shell Plates authentic developer contrast (`R-21`) and visual rhythm shift (`RHYTHM 3`).
- **Typography (`R-06`)**: `Outfit-Black.ttf` (`NaraDisplay`) ensures kinetic words and captions survive fast 9:16 mobile compression without losing weight; `Roboto-Bold.ttf` (`NaraSans`) gives structural annotations and Swiss labels clean hierarchy; `Noto Sans Mono` preserves strict tabular column alignment in Dockerfiles and shell commands.
- **Color Palette (`R-29` — 2 core + 1 accent + neutrals)**:
  - Warm Archival Paper (primary diagram canvas): `#F4EFE6`
  - Secondary Paper Tint (cropped watermarks & structural backing): `#E6DFD3`
  - Deep Charcoal Ink (outlines, typography, hard offset shadows, Code/Shell surface): `#121820`
  - Muted Technical Slate (line numbers, metadata, hairlines): `#5B6572` (on paper) / `#8A96A6` (on ink)
  - Core 1 (Maritime Cobalt Blue): `#1D63ED` (on paper) / `#5EA8FF` (on ink) — shipping containers, primary flow, key words
  - Core 2 (Signal Vermilion): `#D94426` (on paper) / `#F97352` (on ink) — errors, heavy VM overhead, rubber stamps
  - Accent (Container Teal): `#128067` (on paper) / `#34D399` (on ink) — healthy running states, verification marks
- **Shape & Craft Rules (`R-11`, `R-12`, `R-13`)**:
  - Isometric 3D polygon geometry, corrugated container ribs, crisp `3px–3.5px` charcoal ink outlines, and solid hard offset shadows (`+7px, +7px` `#121820`) give weight and physicality without soft blurry shadows or neon glow.
  - Sharp industrial `6px` corners on Code/Shell plates; asymmetric Swiss poster compositions for headline moments.
  - Subtitles/captions carry the narration cleanly in the bottom safe zone (`y=1350`); NO generic top title above every visual/code/terminal shot.
  - Camera pan/zoom safety: keep `camera.x = 0` on two-column and wide diagrams (`width > 750px`) with subtle vertical/scale movement only; reserve horizontal pan (`x != 0`) strictly for single-subject close-ups (`scale >= 1.25`).
  - Split-stage workbench for `ink` shots: pair `CodeBlock` / `TerminalBlock` (`compact`) at the top with a live cue-synced companion SVG below so `code`/`terminal` shots never leave 60% dead empty space.
  - Zero blueprint grids (`R-07`), zero radial neon orbs (`R-01`), zero glassmorphism (`R-10`), zero macOS traffic-light dots (`R-05`), zero emoji (`R-04`), zero em dashes (`R-02`), zero fabricated numbers (`R-17`), zero burned-in footer branding.
  - Full lessons learned and word-driven motion checklist live in [channel2-motion-and-antislop-guide.md](../../docs/workflows/channel2-motion-and-antislop-guide.md).
