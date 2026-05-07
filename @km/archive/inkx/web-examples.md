---
mentions:
  - km
  - claude
id: "@km/inkx/web-examples"
aliases:
  - km-inkx.web-examples
  - km-inkx-web-examples
created_by: claude:ee8efc0f
created_at: 2026-02-23T14:52:32Z
closed_at: 2026-03-04T16:36:12Z
owner: bjorn@stabell.org
assignee: claude:3c1481f8
---

# [x] Fix DOM and Canvas2D browser renderers for live examples @km/inkx #task #P2 @claude:3c1481f8

DOM and Canvas2D browser renderers produce garbled output — all content compressed to single horizontal line.

ROOT CAUSE: Coordinate system mismatch. Layout engine receives pixel dimensions (e.g. 800×600) but interprets them as cell coordinates (cols×rows). Terminal adapter works because it consistently uses cells throughout.

FIX APPROACH: Convert pixel dims to cell dims before passing to layout engine:

- cols = containerWidth / charWidth
- rows = containerHeight / lineHeight

Then DOM/Canvas adapter render() converts cell coords back to pixels for rendering.

FILES:

- browser-renderer.ts (lines 54-61) — needs pixel→cell conversion
- dom/index.ts (lines 124-125) — reads pixels, should convert to cells
- canvas/index.ts — same issue
- dom-adapter.ts render() — needs cell→pixel for output
- canvas-adapter.ts render() — same

Screenshot evidence: /tmp/dom-live.png, /tmp/canvas-live.png (garbled), /tmp/xterm-live.png (correct)

