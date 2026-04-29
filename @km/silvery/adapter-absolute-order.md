---
id: "@km/silvery/adapter-absolute-order"
aliases:
  - km-silvery.adapter-absolute-order
  - km-silvery-adapter-absolute-order
created_by: claude:c9beade3
created_at: 2026-03-13T14:48:03Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] content-phase-adapter: absolute children not painted last (wrong z-order) @km/silvery #bug #P1 @claude:c9beade3

GPT 5.4 Pro re-review finding A1. Main content-phase.ts paints: (1) normal-flow, (2) sticky, (3) absolute children on top. Adapter renderNormalChildren() only does: (1) non-sticky, (2) sticky. Absolute children are NOT isolated into a final topmost pass. Result: absolute overlays can be painted underneath later normal-flow siblings on adapter-backed environments.