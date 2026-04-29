---
id: "@km/flexily/linechildren-memory-leak"
aliases:
  - km-flexily.linechildren-memory-leak
  - km-flexily-linechildren-memory-leak
created_by: claude:65d845d9
created_at: 2026-03-13T05:31:21Z
closed_at: 2026-03-13T05:32:46Z
close_reason: P3 — Module-level _lineChildren is cleared per-layout call
  (resetLayoutCache). Not a real leak in practice since layout runs frequently.
---

# [x] Module-level _lineChildren arrays retain Node references after layout @km/flexily #bug #P3

The pre-allocated _lineChildren arrays (layout-flex-lines.ts) hold references to Node objects after computeLayout() completes. These references persist in the module-level arrays, preventing GC of nodes even if the tree is freed/discarded. Fix: clear _lineChildren references at the end of computeLayout() (zero the arrays or set lengths to 0). This matters for applications that build, layout, and discard trees (e.g., benchmarks, tests, or dynamic UIs that rebuild subtrees). For km/silvery, the tree is long-lived so this is low impact. [pro]