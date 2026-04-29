---
id: "@km/silvery/perf"
aliases:
  - km-silvery.perf
  - km-silvery-perf
created_by: Bjørn Stabell
created_at: 2026-04-09T07:41:31Z
owner: bjorn@stabell.org
---

# [ ] Silvery performance — analysis, benchmarks, and optimization @km/silvery #epic #P1

Silvery performance — analysis, benchmarks, and optimization.

## Current state (2026-04-10, post PreparedText G1-G3)

Silvery wins ALL 16 scenarios vs Ink 7.0 (2.5-5.5x). Post-pipeline work:
- 100 items cursor: 0.406ms (5.5x vs Ink)
- 1000 items cursor: 3.530ms (6.3x vs Ink)
- Benchmarks require SILVERY_STRICT=0 (STRICT adds 7x oracle overhead)

## Completed optimizations
- Dirty node set (canSkipChildSubtree) — O(dirty subtree) skip
- Long-lived Ag instance — cache across frames
- Skip unused pipeline phases — detect feature usage
- Style-only fast path (bgOnlyChange) — skip children for bg changes
- Hybrid output emission — spans + rows + cells
- Reactive cascade via alien-signals — production path
- Epoch dirty flags — O(1) clear, bit-packed 16 bytes/node
- Layout-on-demand gate — skip 6 phases when no layout dirty
- Container-level layout skip — rect comparison
- PreparedText cache (G1-G3) — 3-level text analysis cache

## Open work (children of this epic)
- @km/silvery/resize-fold-bench (P2) — prove PreparedText wins on non-cursor workloads
- @km/silvery/effect-driven-render (P3) — G6: O(dirty) rendering via effects
- @km/silvery/pretext-cumwidths (P3) — cumWidths + O(log n) + balanced line breaking
- @km/silvery/signals-ag-bridge (P2) — reactive rendering without React