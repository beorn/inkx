---
id: "@km/silvery/stability-tests"
aliases:
  - km-silvery.stability-tests
  - km-silvery-stability-tests
created_by: claude:474834b0
created_at: 2026-03-09T21:59:06Z
closed_at: 2026-03-09T23:49:13Z
close_reason: 15 stability tests exist at tests/stability/long-running.test.tsx
  covering 60s sustained rendering, resize cycling, error recovery. All pass.
owner: bjorn@stabell.org
---

# [x] Long-running stability tests: 60s sustained rendering, resize handling @km/silvery #task #P3

Verify silvery apps run for 60+ seconds without crash or degradation. Test terminal resize handling under sustained load.