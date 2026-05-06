---
mentions:
  - km
id: "@km/silvery/signals-engine"
aliases:
  - km-silvery.signals-engine
  - km-silvery-signals-engine
created_by: Bjørn Stabell
created_at: 2026-04-09T17:58:16Z
owner: bjorn@stabell.org
---

# [ ] Speculative: end-to-end signals engine — reactive layout + content + output @km/silvery #feature #P4

Speculative v2.0+ exploration. What if the rendering engine itself was signal-based? Layout dimensions as computed signals, cell content as computed signals, output as subscriptions. Eliminates: dirty flags, pipeline tree walks, buffer diff, cascade logic. Pattern proven by km reactive-graph.ts (tree.descendants().some(), tree.ancestors().reduce()). Terminal doesn't need this (2.5-5.2x is enough). Canvas v2.0 might — 60fps with 10K+ elements needs O(changed) not O(tree). Design doc: vendor/internal/silvery/design/v20-canvas/signals-engine.md. Depends on: @silvery/solid landing first.

