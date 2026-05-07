---
mentions:
  - km
id: "@km/review-chaos/1-chaos-regression-framework-unused-no-captured-bugs"
aliases:
  - km-review-chaos.1
  - km-review-chaos-1
  - "@km/review-chaos/1"
created_at: 2026-01-23T09:01:29Z
closed_at: 2026-01-23T09:22:19Z
---

# [x] Chaos regression framework unused - no captured bugs @km/review-chaos #task #P1

regression.test.ts:122-125 uses test.skip when no scenarios exist. The regressions/ directory is empty (only README.md). The framework is ready but has never captured a real bug.

