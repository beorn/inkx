---
id: "@km/_orphan/flexx-diag-passes"
aliases:
  - km-flexx-diag-passes
created_at: 2026-01-31T16:00:27Z
closed_at: 2026-01-31T16:18:48Z
assignee: claude:b8b4780b
---

# [x] Deep nesting diagnosis: add pass counters @km/_orphan #task #P0 @claude:b8b4780b

Add pass counters to layout-zero.ts to diagnose deep nesting O(n²) issue. CRITICAL: 450x slower than Yoga is unacceptable for drop-in Yoga goal. Must diagnose and fix before FOSS release.