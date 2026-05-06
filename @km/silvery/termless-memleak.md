---
mentions:
  - km
  - claude
id: "@km/silvery/termless-memleak"
aliases:
  - km-silvery.termless-memleak
  - km-silvery-termless-memleak
created_by: Bjørn Stabell
created_at: 2026-04-10T04:36:42Z
closed_at: 2026-04-21T04:37:39Z
close_reason: >-
  Root cause: test files created xterm.js-backed Term instances via `const term
  = createTermless(...)` without `using` or explicit `term[Symbol.dispose]()`.
  Each Term holds a 1000-line scrollback buffer (~1 MB). Across thousands of
  tests in a long CI run, this accumulated to 18-28 GB RSS per vitest fork
  worker.


  Fix: converted 7 silvery test files to `using term = createTermless(...)` (or
  added `term?.[Symbol.dispose]?.()` to the shared `afterEach`/`afterAll`
  alongside existing `handle?.unmount()`). Added a WeakRef-based leak detector
  to `@silvery/test`'s `createTermless()` that warns when >128 live Terms are
  detected.


  Harness: `vendor/silvery/tests/perf/termless-memleak-harness.test.tsx` runs
  120 iterations of `createTermless` + `run` + unmount with `using` and asserts
  median-of-thirds RSS growth is bounded (<300 KB/iter). Baseline after fix: ~30
  KB/iter. Leaky baseline before: ~1 MB/iter RSS, extrapolates to 25 GB after
  25000 tests — matches observed worker footprint.


  Commits (in km submodule branches):
    silvery: 6f6cff4f (harness), 7d44e363 (dispose fixes), 066a8989 (harness hardening)
    km:      6e1148e2d (km-tui comment), e31e81210 (knowledge-file postmortem)

  Verification:

  - vendor silvery: 0 new TS errors (49 pre-existing TS5097/TS1501 extension
  warnings unchanged)

  - vendor full suite (STRICT=1): 13 failed files / 22 failed tests (down from
  14 / 30 before fix — 1 file + 8 tests recovered, no new failures)

  - harness passes standalone AND in full `test:vendor` run


  Defense-in-depth going forward:

  - `getActiveTermlessCount()` exported from @silvery/test for future tests that
  want to assert cleanup

  - silvery-knowledge.md postmortem entry
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
---

# [x] Termless vitest workers leak memory — 25GB+ per worker in long test runs @km/silvery #bug #P1 @claude:8b5b9e1c

Vitest fork workers running termless tests (xterm.js emulator) accumulate 18-28GB RSS over 10-15 minute runs. Likely xterm.js Terminal instances not being disposed between tests, or TerminalBuffer/TextFrame snapshots accumulating. Discovered during CI fix session 2026-04-09 when 3 workers consumed 98% of 128GB RAM.

