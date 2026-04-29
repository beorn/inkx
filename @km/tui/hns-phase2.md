---
id: "@km/tui/hns-phase2"
aliases:
  - km-tui.hns-phase2
  - km-tui-hns-phase2
created_by: Bjørn Stabell
created_at: 2026-04-08T07:31:03Z
closed_at: 2026-04-08T08:13:19Z
close_reason: Cut over cursorInDescendant reads to reduced signals. All 217
  tests pass. Commit 7adef8f4c.
---

# [x] Phase 2: Cutover — switch reads to reduced signals @km/tui #task #P1 @Bjørn Stabell

Switch components from old sync to reduced signals. Old sync becomes shadow oracle (reversed roles).

## What to do

1. Switch components to read cursorDescendant (replaces cursorInDescendant)
2. Switch components to read selectedAncestor (replaces ad-hoc checks)
3. Adapt isColumnSelected, isBoardSelected, isCursorOnCard to derive from new signals
4. Adapt shouldStripColor to derive from cursor/selectedAncestor
5. Reverse shadow roles: new signals drive UI, _legacySyncCursor becomes compare-only
6. Short soak: run full test suite once with reversed roles, verify golden tests pass

After this phase, Board.tsx calls batch() as the primary path. _legacySyncCursor/_legacySyncSelected still exist but only for the Phase 3 deletion — they no longer drive any UI.

## Delete
Nothing deleted yet — _legacy methods still exist for Phase 3 cleanup.

## /complete
\`\`\`bash
# Golden tests pass with NEW implementation driving UI
bun vitest run apps/km-tui/tests/cursor-colors.test.ts  # must pass
bun vitest run apps/km-tui/tests/board-selection.slow.spec.ts  # must pass
bun vitest run apps/km-tui/tests/column-rendering.test.ts  # must pass
bun run test:fast  # all pass

# Components no longer read old signals directly:
rg 'useSignal.*cursorInDescendant' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (replaced by cursorDescendant)
# NOTE: cursorInDescendant signal DEFINITION still exists in reactive.ts (removed in Phase 3)
# NOTE: _legacySyncCursor/_legacySyncSelected still exist as private shadow (removed in Phase 3)
# These are EXPECTED exceptions — Phase 3 deletes them.

# No component imports syncCursor/syncSelected (already renamed in Phase 1):
rg 'syncCursor\b' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0

# Bench: content render ≤ Phase 0 baseline
\`\`\`