---
id: "@km/tui/cursor-perf-2026-04-07"
aliases:
  - km-tui.cursor-perf-2026-04-07
  - km-tui-cursor-perf-2026-04-07
created_by: Bjørn Stabell
created_at: 2026-04-07T18:18:05Z
closed_at: 2026-04-08T06:54:18Z
close_reason: "Triaged: root cause is silvery output phase (76-89% of wall
  time), not node state. Work split into km-silvery.output-phase-perf (P0) and
  km-tui.hierarchical-node-state (P1), both under km-tui.tree-perf."
owner: bjorn@stabell.org
---

# [x] Cursor j-press latency at ~104-111ms (felt sluggish in km view) @km/tui #bug #P1

## User report (2026-04-07)

> "i think i notice that 'km view' feels more sluggish cursoring around now - just a bit"
> "zoom/cursoring does feel a bit more slow"
> "it felt faster just after the big refactoring to reach quality plateau and completely switch to signals"

## Measurement (current HEAD: b86f936d3, 2026-04-07)

Ran `bun vitest bench apps/km-tui/tests/cursor-perf.bench.ts` after fixing the bench config to exclude worktrees + .direnv. Results saved to `benchmarks/results/cursor-perf-2026-04-07-HEAD.txt`.

```
Full pipeline: 20 j-presses on column of N cards (200x60 terminal)
   100 cards   →  2080ms total = 104ms / press
   500 cards   →  2089ms total = 104ms / press
  1000 cards   →  2101ms total = 105ms / press
  2000 cards   →  2174ms total = 109ms / press
  3700 cards   →  2223ms total = 111ms / press
```

`getSibling` overhead is fine (0.09ms at 100 siblings, 2.92ms at 3700) — the per-node hot path is NOT the bottleneck.

## Key insight

Latency barely scales with column size (104→111ms across 36× more cards). The 104ms is **fixed per-press cost**, not per-node. That **inverts** the initial hypothesis (per-node sticky-fold useSignal subscriptions). Per-node work adds at most ~7ms over a 36× scale.

## Where the fixed cost lives (suspects)

1. **silvery view-coalescing** (f8cc395, today) — adds ≥2 setImmediate yields per event batch (~2-4ms)
2. **Layout (Flexily) full re-pass per cursor move** (~30-50ms estimated, pre-existing)
3. **Silvery output diff + ANSI emit** (~20-40ms estimated, pre-existing)
4. **React reconciliation** (~10-20ms, pre-existing)
5. **stableBodyIdSet useMemo** invalidating per render due to children identity churn

## Deferred: comparison against post-plateau baseline

Wanted to compare against 2910f2dd8 (post-quality-plateau, ~10 days ago, what user remembers as "fast"), but:
- Spinning up a worktree at that commit needs full submodule init + bun install
- System was at 86% memory with multiple bun processes from the parallel /max session
- Bench at HEAD took 5+ minutes and 9.9GB RAM before completing

Comparison TODO: when system is less loaded, run the same bench at 2910f2dd8 and diff. If 2910f2dd8 is significantly faster, bisect the intervening commits to find the first regression.

## bench config bug found and fixed

`vitest.config.ts` `benchmark` section was missing `exclude: alwaysExclude`, causing `bunx vitest bench <file>` to walk into every git worktree under .claude/worktrees/ and the .direnv flake mirror, hitting bun:sqlite import errors. Fixed in b86f936d3.

## Followup beads needed

- @km/tui/cursor-perf-baseline-saved — ship `bench:baseline` output to `benchmarks/baseline.json` so future regressions are detected automatically
- @km/tui/cursor-perf-bisect — bisect the regression once a baseline exists
- @km/silvery/layout-pass-incremental — explore making layout incremental (pre-existing concern)

## Acceptance

- Per-press latency at 200x60, 1000 cards: < 50ms (4× improvement over current ~105ms)
- Stretch goal: < 16ms (feels instant)