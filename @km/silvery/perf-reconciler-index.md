---
id: "@km/silvery/perf-reconciler-index"
aliases:
  - km-silvery.perf-reconciler-index
  - km-silvery-perf-reconciler-index
created_by: claude:c9beade3
created_at: 2026-03-13T04:36:51Z
closed_at: 2026-03-13T05:22:01Z
close_reason: "Deferred: Reconciler uses filter/slice for child index lookups.
  O(n) per lookup but n is typically small (5-20 children). Map-based index
  would add memory overhead for marginal gain. No measured bottleneck."
---

# [x] Perf: Reconciler O(n) child index computations via filter/slice @km/silvery #task #P3

host-config.ts uses .filter().length and .slice().filter().length for layout index on every insert/reorder. Replace with for-loops or maintain layoutChildCount. Found by GPT 5.4 pro.