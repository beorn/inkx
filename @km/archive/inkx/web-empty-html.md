---
mentions:
  - km
  - claude
id: "@km/inkx/web-empty-html"
aliases:
  - km-inkx.web-empty-html
  - km-inkx-web-empty-html
created_at: 2026-02-04T11:23:58Z
closed_at: 2026-02-04T12:48:55Z
assignee: claude:27f1a547
---

# [x] inkx-empty-html: Canvas/DOM adapter examples render empty HTML files @km/inkx #bug #P4 @claude:27f1a547

The canvas-adapter and dom-adapter examples in vendor/beorn-inkx/examples/web/ generate HTML files but the rendered content appears empty.

Investigate:

1. What the examples are supposed to output (canvas-app.tsx, dom-app.tsx)
2. Whether the adapters are rendering content correctly
3. Why the output HTML files don't contain visible content

This may be related to the recent merge that integrated canvas/dom adapters into the inkx-loop branch.

