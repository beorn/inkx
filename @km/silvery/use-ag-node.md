---
id: "@km/silvery/use-ag-node"
aliases:
  - km-silvery.use-ag-node
  - km-silvery-use-ag-node
created_by: Bjørn Stabell
created_at: 2026-04-12T15:09:44Z
closed_at: 2026-04-12T15:26:17Z
close_reason: "useAgNode() + useSignal() hooks. Commits: 19a78113, b32b5821."
---

# [x] useAgNode() hook — expose reactive rect signals as public primitive @km/silvery #feature #P1

blocks:: [[@km/silvery/reactive-pipeline]]

Extract useAgNode() from the rect-signals infrastructure (Phase 4). Returns { node, boxRect, scrollRect, screenRect } where the rect fields are alien-signals for pull-based reactivity.

Current state: getRectSignals() lives in @silvery/ag-term/pipeline/rect-signals.ts (WeakMap-backed, lazy). useReactiveRect() in useLayout.ts already uses it internally.

Before shipping as a silvery-public primitive:
1. Move rect-signals from @silvery/ag-term/pipeline/ to @silvery/ag/ (framework-agnostic core) so canvas/DOM adapters can also use it
2. Consider scope expansion: beyond rects, add signal wrappers for dirtyBits, focus state, cursor membership (Design G two-level reactive graph)
3. Decide API: useAgNode() returns signals directly vs useAgNode() returns node + signals object

Part of the Design G reactive pipeline vision.