---
mentions:
  - km
  - Bjørn
id: "@km/flexily/phase7a-dead-work"
aliases:
  - km-flexily.phase7a-dead-work
  - km-flexily-phase7a-dead-work
created_by: Bjørn Stabell
created_at: 2026-04-09T14:30:10Z
closed_at: 2026-04-09T15:54:40Z
close_reason: "Fixed. Deep tree 50: Yoga 2.82x gap → 1.61x. 1562 tests pass. Commit f4898ad."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Fix Phase 7a dead-work bug — closes deep tree 2.38x loss @km/flexily #task #P0 @Bjørn Stabell

Straight win. Flexily Phase 7a (cross-size estimation) calls measureNode on children when the result is never consumed. Creates O(depth²) wasted work on deep trees.

## Impact

- Closes deep tree 2.38x loss (likely flips to silvery winning)
- Benefits ALL layouts, not just deep trees (Phase 7a runs on every layoutNode call)
- Silvery-internal bench: vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts

## Root cause

vendor/flexily/src/layout-zero.ts:883-949 — Phase 7a calls measureNode for cross-size estimation. For single-line + single-child case with no baseline alignment, the result is never consumed (Phase 8 computes its own cross size from stretch/explicit/shrink-wrap).

## Fix

Skip Phase 7a when:

- numLines === 1
- alignItems !== ALIGN_BASELINE
- Only one relative child

## Effort

~1 day. This is a bug fix — eliminate wasted work, no new complexity.

## Verification

- Run: SILVERY_STRICT=0 bun vitest bench vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
- Expected: deep tree 20 flips from Ink 1.66x → Silvery wins
- Expected: deep tree 50 flips from Ink 2.38x → Silvery wins or ties
- Run flexily fuzz tests: bun vitest run vendor/flexily/tests/relayout-consistency.test.ts

