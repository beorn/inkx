---
id: "@km/inbox/test-perf"
aliases:
  - km-test-perf
  - "@km/_orphan/test-perf"
created_at: 2026-01-27T23:06:12Z
closed_at: 2026-01-28T10:23:40Z
---

# [x] Test performance tracking and slow test detection @km/_orphan #feature #P3

Custom vitest reporter that tracks test timing, detects slow tests, and exports performance data for trending.

See infra/vitest-reporter.ts for implementation.
See docs/future/monorepo-infra.md for design.