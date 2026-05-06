---
mentions:
  - km
id: "@km/silvery/perf-diff-sort"
aliases:
  - km-silvery.perf-diff-sort
  - km-silvery-perf-diff-sort
created_by: claude:c9beade3
created_at: 2026-03-13T04:31:09Z
closed_at: 2026-03-13T05:22:00Z
close_reason: "Deferred: sortPoolByPosition uses Array.sort (Timsort). For
  typical diffs (10-50 changes), Timsort is already near-optimal. Hybrid sort
  (radix+insertion) only benefits 1000+ element arrays. No measured bottleneck."
owner: bjorn@stabell.org
---

# [x] Perf: Use hybrid sort in sortPoolByPosition for large diffs @km/silvery #task #P3

Insertion sort in changesToAnsi is good for small/nearly-sorted counts but bad for large resize/full-redraw. Use insertion sort below threshold (~64-128), native sort above. Found by GPT pipeline review.

