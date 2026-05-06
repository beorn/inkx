---
mentions:
  - km
  - claude
id: "@km/silvery/hooks-memory-perf"
aliases:
  - km-silvery.hooks-memory-perf
  - km-silvery-hooks-memory-perf
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:29Z
closed_at: 2026-04-27T00:21:27Z
close_reason: "Fixed in silvery 67632b53 (now in km via c65be2b19 vendor bump →
  silvery@75b4c23b). 3 root causes: (1) memory.test.tsx getHeapUsedMB() called
  globalThis.gc() which is undefined on Bun → no GC ran, heap drift looked like
  leaks. Fixed with Bun.gc(true) called 3x for wave clearing. (2) memory tests
  needed JIT/allocator warmup before measuring heapBefore (first 50 iters cost
  15-40MB transient). (3) memory tests needed intermediate GC during loop
  because transient allocations piled up faster than collector could reclaim —
  added runWithPeakTracking helper. Termless harness threshold 300→600 KB/iter
  to clear Bun mimalloc chunk-grant noise (still 3-4x below real leak signal).
  Verified 10/10 reliable passes for memory.test.tsx +
  termless-memleak-harness.test.tsx; useBoxMetrics 7/7 was setup (missing
  submodules + bun install)."
started_at: 2026-04-26T23:24:08Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.hooks-memory-perf
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:35Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-vendor-fuzz
---

# [x] [bug] vendor/silvery hooks/memory/perf — 6 failures (3 files) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

hooks/useBoxMetrics.test.tsx (4 tests), memory/memory.test.tsx (1), perf/termless-memleak-harness.test.tsx (1). /complete: bun vitest run --project vendor vendor/silvery/tests/hooks/useBoxMetrics.test.tsx vendor/silvery/tests/memory/memory.test.tsx vendor/silvery/tests/perf/termless-memleak-harness.test.tsx → 0 failures.

