---
id: "@km/_orphan/teya0"
aliases:
  - km-teya0
created_by: claude:65d845d9
created_at: 2026-03-13T01:36:34Z
closed_at: 2026-03-13T01:36:40Z
close_reason: "Fixed in f057896d. Two root causes: (1) clearExcessArea on fresh
  buffers — added bufferIsCloned guard to NodeRenderState. (2) singlePassLayout
  loop limited to 2 passes — increased to 3 (MAX_SINGLE_PASS_ITERATIONS).
  Regression tests in resize-garble.slow.test.ts (4 tests)."
---

# [x] Resize garble: zoom out 2-3x causes garbled rendering @km/_orphan #bug #P1

Two root causes fixed: (1) clearExcessArea running on fresh buffers during multi-pass resize, writing inherited bg into cells that doFreshRender leaves as default. Fixed with bufferIsCloned guard. (2) singlePassLayout loop limited to 2 passes, insufficient for resize (needs 3: stale zustand + updated dims + layout feedback). Fixed with MAX_SINGLE_PASS_ITERATIONS=3.