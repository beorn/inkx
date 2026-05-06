---
mentions:
  - km
  - Bjørn
id: "@km/silvery/bench-usestate"
aliases:
  - km-silvery.bench-usestate
  - km-silvery-bench-usestate
created_by: Bjørn Stabell
created_at: 2026-04-09T14:30:24Z
closed_at: 2026-04-09T15:54:38Z
close_reason: "Scenarios added. Critical finding: Ink 24-32x faster on memo'd
  trees. Created km-silvery.memo-pipeline-regression P0."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Add useState benchmarks — prove real incremental advantage @km/silvery #task #P0 @Bjørn Stabell

Add mounted useState benchmarks that reflect real-world silvery use. Current bench passes fresh React trees which is silvery's worst case.

## Impact

- Proves silvery's real incremental advantage (expected 5-10x on 1000-item updates)
- Better marketing narrative — honest numbers on the actual use case
- Current 1000-item list "loss" is a benchmark artifact

## What to add

Three mounted useState scenarios in vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts:

### A. Parent useState update

- Parent holds cursor state
- Child rows subscribe via props
- setState triggers React bailout on unchanged children
- Closest to typical list selection

### B. Local item state

- Each row has local useState
- Exposed setter via register callback
- Best-case localized update

### C. External store + selector

- createStore with selectors
- Rows use store subscription
- memo'd components
- Closest to production optimization

## Harness

- Memory-backed writable stream (no terminal I/O)
- Expose setter via React ref or closure
- Call setState in bench iteration, wait for commit
- Measure end-to-end update cost

## Matrix

Run each scenario in 4 modes: render(newTree), parent useState, local useState, store selector

## Effort

~2-4 hours.

## Expected result

Silvery wins 5-10x on parent useState + 1000 items because:

- React bailout skips 999 children
- Silvery's dirty tracking runs on 1-2 actually-changed nodes
- vs passing new tree: React visits all 1000 fibers, silvery's dirty checks run on all 1000

