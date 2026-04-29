---
id: "@km/inkx/live-docs"
aliases:
  - km-inkx.live-docs
  - km-inkx-live-docs
created_by: claude:ee8efc0f
created_at: 2026-02-23T00:33:12Z
closed_at: 2026-02-23T01:50:47Z
---

# [x] Live docs site: xterm.js + canvas example viewer @km/inkx #feature #P3

Web-based documentation site that shows inkx examples running live in the browser, in both xterm.js (terminal emulation) and canvas rendering modes side by side.

## Concept
- Each example from examples/ can be rendered in the browser
- xterm.js mode: terminal emulator widget showing the example as it would appear in a real terminal
- Canvas mode: using inkx's canvas adapter to render the same React components to HTML5 Canvas
- Side-by-side or toggle between modes
- Source code view with syntax highlighting

## Prior Art
- examples/viewer.tsx already auto-discovers examples from category dirs and renders them in a TUI storybook
- examples/web/canvas.html + canvas-app.tsx show canvas adapter rendering
- examples/web/dom.html + dom-app.tsx show DOM adapter rendering
- examples/web/build.ts handles bundling

## Implementation Ideas
- Use the existing example auto-discovery pattern
- Bundle examples for browser with Bun/esbuild
- xterm.js widget that receives ANSI output from renderStatic()
- Canvas widget using renderToCanvas()
- Vitepress/Astro/plain HTML site with embedded widgets