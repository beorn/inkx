---
mentions:
  - km
id: "@km/silvery/flicker-tests"
aliases:
  - km-silvery.flicker-tests
  - km-silvery-flicker-tests
created_by: claude:474834b0
created_at: 2026-03-09T21:59:06Z
closed_at: 2026-03-09T23:49:16Z
close_reason: 15 flicker tests exist at tests/visual/flicker.test.tsx covering
  useContentRect stabilization, state coalescing, incremental vs fresh. All
  pass.
owner: bjorn@stabell.org
---

# [x] Flicker regression tests: useContentRect, render coalescing @km/silvery #task #P3

Verify no visual flicker from useContentRect (width=0 first frame), rapid state changes coalesce, and first render shows content not zeros.

