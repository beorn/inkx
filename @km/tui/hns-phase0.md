---
id: "@km/tui/hns-phase0"
aliases:
  - km-tui.hns-phase0
  - km-tui-hns-phase0
created_by: Bjørn Stabell
created_at: 2026-04-08T07:30:41Z
closed_at: 2026-04-08T07:59:24Z
close_reason: Fixed symlink test, added 12 golden visual tests, all 216 test
  files passing. Commit b4507db28.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 0: Characterize — golden tests + bench baseline @km/tui #task #P1 @Bjørn Stabell

Freeze current visual semantics before any refactoring begins.

## What to do

1. Run + capture golden baselines: cursor-colors.test.ts, board-selection.slow.spec.ts, column-rendering.test.ts
2. Add 5 missing golden tests:
   - Cursor-in-descendant visual at ALL levels (column, card, sub-item) — not just cards
   - Edit expansion (card expands when child enters edit)
   - Excluded sigil filtering
   - Batch atomicity (no stale reads during transition)
   - Reduced signal sync correctness (all signals agree after batch)
3. Rewrite board-test.ts helper (~400 LOC) to support batch() semantics alongside old API
4. Capture cursor-perf bench baseline (wall + per-phase breakdown)
5. Fix pre-existing test failures (4: windowing-wire pane focus + symlink task cycling)

## Delete
Nothing — this phase only adds.

## New tests
- tests/golden/cursor-descendant-all-levels.test.ts
- tests/golden/edit-expansion.test.ts
- tests/golden/sigil-filtering.test.ts
- tests/golden/batch-atomicity.test.ts
- tests/golden/signal-sync.test.ts

## /complete
\`\`\`bash
bun vitest run apps/km-tui/tests/cursor-colors.test.ts  # must pass
bun vitest run apps/km-tui/tests/board-selection.slow.spec.ts  # must pass
bun vitest run apps/km-tui/tests/column-rendering.test.ts  # must pass
bun vitest run apps/km-tui/tests/windowing-wire.test.ts  # must pass (fixed)
bun vitest run apps/km-tui/tests/symlink.test.ts  # must pass (fixed)
# Bench baseline saved to benchmarks/results/
ls benchmarks/results/hns-phase0-baseline-*.txt  # must exist
\`\`\`