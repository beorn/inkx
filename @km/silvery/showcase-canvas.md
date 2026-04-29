---
id: "@km/silvery/showcase-canvas"
aliases:
  - km-silvery.showcase-canvas
  - km-silvery-showcase-canvas
created_by: claude:491faf6c
created_at: 2026-03-25T20:33:05Z
closed_at: 2026-03-26T06:44:06Z
close_reason: Canvas renderer with full input support implemented and tested.
  All 5 demos render on canvas with keyboard navigation working.
---

# [x] Switch showcase demos from xterm.js iframe to canvas renderer @km/silvery #task #P1 @claude:fed8de9e

## Problem
xterm.js in an iframe is fundamentally wrong for docs showcases. Every bug (uneven padding, cropping, broken input, rendering corruption, scrolling) stems from the terminal emulator fighting the browser's layout/event system.

## Solution
Switch to silvery's canvas renderer (already built: canvas-app.js exists in dist/).

Canvas advantages:
- Pixel-perfect — no character grid alignment issues
- No iframe — native browser events, scrolling, focus
- No xterm.js dependency — smaller, simpler
- Already works — canvas-app.tsx and canvas.html exist

## Implementation
1. Create showcase-canvas-app.tsx (like showcase-app.tsx but uses renderToCanvas instead of renderToXterm)
2. Create showcase-canvas.html (like showcase.html but with canvas element)
3. Update ShowcaseGallery.vue to use the canvas version
4. Update LiveDemo.vue similarly
5. Rebuild bundles (bun run examples/web/build.ts)
6. Test all 5 demos via /test-site
7. If canvas works well, delete the xterm showcase path

## Alternative: Pre-recorded SVGs
For non-interactive demos (homepage hero), use termless screenshot() to generate SVG recordings. Zero runtime, zero bugs.