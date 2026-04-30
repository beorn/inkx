---
id: "@km/inbox/flexx-bench-measure"
aliases:
  - km-flexx-bench-measure
  - "@km/_orphan/flexx-bench-measure"
created_at: 2026-01-30T17:17:21Z
closed_at: 2026-01-30T17:50:58Z
---

# [x] Add measure call counting to Flexx benchmarks @km/_orphan #task #P2

The yoga-compare.bench.ts benchmarks test layout performance but don't track the number of measure function invocations.

Should add:
- Counter for actual measure function calls (not cache hits)
- Comparison between Flexx and Yoga measure call counts
- Report showing calls-per-node ratio

This would help catch O(n²) measure call patterns like the one we found (181 calls/node).

Related: Node.measureCalls and Node.measureCacheHits static counters already exist.