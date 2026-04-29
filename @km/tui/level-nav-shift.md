---
id: "@km/tui/level-nav-shift"
aliases:
  - km-tui.level-nav-shift
  - km-tui-level-nav-shift
created_at: 2026-02-04T17:49:50Z
closed_at: 2026-02-05T10:09:06Z
---

# [x] Board content shifts after level navigation round-trip @km/tui #bug #P2 @claude:10db6ea8

When navigating k k j j (up to board level, back to card), the board shows different content than before. Discovered via cursor-stability.spec.ts invariant test. Real vault shows: before='Zone 1: 50-60%', after='Health & Fitness'. Synthetic data passes.