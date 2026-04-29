---
id: "@km/storage/scale-benchmarks"
aliases:
  - km-storage.scale-benchmarks
  - km-storage-scale-benchmarks
created_by: claude:8b5b9e1c
created_at: 2026-04-21T08:37:21Z
closed_at: 2026-04-21T22:29:34Z
close_reason: "Shipped. Harness + results committed at 4d516dda4. Results:
  full-load fails at 2x (20k files, 102s), 10x takes 8.6min/27GB RSS, per-query
  perf stays good throughout. See
  hub/km/research/scale-bench-results-2026-04-21.md. The data underwrites the
  federation + lazy-hydration design in storage-architecture.md."
---

# [x] Scale benchmark harness — synthetic 2x/5x/10x corpus + workload runners @km/storage #feature #P1

blocks:: [[@km/all/plateau]]

Prerequisite for @km/storage/scale-architecture acceptance. Without measured failure modes, scale-architecture is astrology.

## Deliverables

1. Synthetic vault generator — knobs for: file count, nodes per file, link density, block-ref ratio, heading depth. Produces deterministic 1x (~130K-node vault), 2x (~260K), 5x (~650K), 10x (~1.3M), 100x (~13M).
2. Real-vault trace replay — captures user session events (navigate, search, edit, open) from real ~/Bear/Vault, replays against synthetic corpora.
3. Workload runners:
   - Cold-start to first interactive frame
   - Navigation (open file, jump via link)
   - Search (narrow/broad FTS5 query)
   - Backlink query (popular target, rare target)
   - Edit burst (keystroke flood, persistence)
   - Rename/move (link update cascade)
   - External edit detection (file changed outside km)
4. Latency + memory metrics recording: p50/p95/p99 per workload, heap at intervals, GC pause distribution.

## Acceptance

- Harness runs headless via `bun tools/scale-bench.ts`
- Output is structured JSON + human-readable markdown report
- Can point at any vault size (live or synthetic) via flag
- Runs in CI-friendly time at 1x, reasonable time at 10x (don't require 100x in CI)
- Documented in hub/km/scale-benchmarks.md

## NOT this bead

- Running the benchmarks at 100x (100x is an ops concern, not CI concern)
- Designing the fixes for any failures found (that's scale-architecture's job)