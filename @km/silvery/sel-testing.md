---
id: "@km/silvery/sel-testing"
aliases:
  - km-silvery.sel-testing
  - km-silvery-sel-testing
created_by: Bjørn Stabell
created_at: 2026-04-03T21:46:41Z
closed_at: 2026-04-04T20:21:52Z
---

# [x] Selection testing infrastructure — 4-layer test plan @km/silvery #task #P1

Testing infrastructure — 3 layers.

## Layer 1: Pure transitions (Phase 1)
- tests/apply.test.ts — all apply* functions
- tests/pointer.test.ts — pointer state machine
- tests/ordered-set.test.ts
- ~100 tests, instant

## Layer 2: Store integration (Phase 2)
- tests/store.test.ts — signal reactivity, reconciliation
- tests/sub.test.ts — polymorphic sub-selection
- ~50 tests

## Layer 3: km integration (Phase 3)
- @km/tui tests adapted to use new API
- Termless tests verify pointer interactions end-to-end

## /complete
```
bun vitest run packages/silvery-selection/ → all pass
bun run test:fast → all pass
```