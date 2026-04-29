---
id: "@km/flexily/broken-benchmarks"
aliases:
  - km-flexily.broken-benchmarks
  - km-flexily-broken-benchmarks
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:56Z
closed_at: 2026-03-13T05:35:18Z
close_reason: "Fixed: changed import from '../src/index.js' to
  '../src/index-classic.js' for Classic engine in
  bench/classic-vs-zero.bench.ts. Both imports pointed at the zero-alloc engine,
  making the comparison meaningless. Verified Classic.Node \\!== Zero.Node and
  both produce correct results."
---

# [x] Bug: Benchmark scripts import same engine twice — classic-vs-zero comparison broken @km/flexily #bug #P1 @claude:65d845d9
