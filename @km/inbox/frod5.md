---
id: "@km/inbox/frod5"
aliases:
  - km-frod5
  - "@km/_orphan/frod5"
created_by: claude:b509d761
created_at: 2026-02-10T11:22:32Z
closed_at: 2026-02-10T12:01:11Z
owner: bjorn@stabell.org
---

# [x] Flexx re-layout inconsistency: incremental layout differs from fresh (fuzz seed=73) @km/_orphan #bug #P2

Discovered by relayout-consistency fuzz tests. When a random tree is laid out, dirtied partially, and re-laid out, the incremental result differs from a fresh layout of the same tree. Widths differ (74 vs 76) and heights differ (12 vs 26). Same bug class as @km/_orphan/10mat but different tree structure. Reproduce: run relayout-consistency.test.ts seed=73 (currently marked it.fails).