---
id: "@km/inbox/yl79g"
aliases:
  - km-yl79g
  - "@km/_orphan/yl79g"
created_at: 2026-02-02T16:12:24Z
closed_at: 2026-02-04T11:23:58Z
---

# [x] inkx-empty-html: Canvas/DOM adapter examples render empty HTML files @km/_orphan #bug #P2

The canvas-adapter and dom-adapter examples in vendor/beorn-inkx/examples/web/ generate HTML files but the rendered content appears empty.

Investigate:
1. What the examples are supposed to output (canvas-app.tsx, dom-app.tsx)
2. Whether the adapters are rendering content correctly
3. Why the output HTML files don't contain visible content

This may be related to the recent merge that integrated canvas/dom adapters into the inkx-loop branch.