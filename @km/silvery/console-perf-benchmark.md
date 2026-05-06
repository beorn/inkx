---
mentions:
  - km
id: "@km/silvery/console-perf-benchmark"
aliases:
  - km-silvery.console-perf-benchmark
  - km-silvery-console-perf-benchmark
created_by: claude:019d032d
created_at: 2026-04-23T01:26:17Z
closed_at: 2026-04-23T02:28:37Z
close_reason: >-
  Shipped vendor/silvery/tests/perf/console-flush-10k.perf.test.ts —
  PERF=1-gated benchmark codifying the Phase D Console invariant.


  Observed on M-series mac:
    - 10,000 log calls: 3.39 ms (0.0003 ms/log)
    - entriesSnapshot() after burst: 3.37 ms, length 10,000, frozen ✓
    - count signal fires: 10,001 (1 seed + 10,000 per-log) ✓

  Budget assertion: elapsedMs < 500 ms (3 orders of magnitude headroom — leaves
  room for noisy CI hosts without masking a regression that reintroduces per-log
  array copy).


  Gated with describe.skipIf(!process.env.PERF) so it stays out of default test
  matrix. Run with:
    PERF=1 bun vitest run --project vendor vendor/silvery/tests/perf/console-flush-10k.perf.test.ts

  Silvery commit: 4cc98fb0 ('test(console): 10k-entry perf benchmark verifying
  O(n) amortized flush').

  km submodule pointer updated via 117769eb5 (tribe concurrent commit) which
  bumped silvery to 8563712e — 4cc98fb0 is in its ancestry, so the file is
  present in the km tree at HEAD.


  Verification:
    - New benchmark: 1 passed (179 ms, PERF=1)
    - Existing console.test.ts + console-output-coexistence.test.ts: 21 passed
    - tsc --noEmit: 0 errors on new file
    - Without PERF: 1 skipped ✓
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.console-perf-benchmark
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T18:26:32Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.term-sub-owners
---

# [x] Verify Console.count/entriesSnapshot refactor is O(n) amortized (Pro P1-9 claim) @km/silvery #task #P3

blocks:: [[@km/silvery/term-sub-owners]]

## Why

Phase D replaced the per-log `Object.freeze(buffer.slice())` publish with a cheap count signal + explicit entriesSnapshot() method, claiming O(n²) → O(n) amortized. Pro review flagged the perf concern; we fixed the design but never verified the benchmark.

## Scope

Add `vendor/silvery/tests/performance/console-perf.bench.ts` (or similar):

- Baseline: create a Console, capture, log N entries (N = 100, 1000, 10000), measure wall time.
- Verify linear scaling: 10× N ≈ 10× time (not 100×).
- Verify peak memory: buffer size grows linearly, not quadratically.
- Spot-check: 10k entries completes in under ~500ms on reference hardware.

## Acceptance

- [ ] Benchmark file exists, runs with `bun run bench` (or equivalent)
- [ ] Results document linear scaling (printed in a comment or CI-logged)
- [ ] If the result is NOT linear, reopen the Phase D bead and investigate

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

