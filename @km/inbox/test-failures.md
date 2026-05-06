---
mentions:
  - km
id: "@km/inbox/test-failures"
aliases:
  - km-test-failures
  - "@km/_orphan/test-failures"
created_at: 2026-01-25T11:22:22Z
closed_at: 2026-01-27T10:07:06Z
---

# [x] Fix remaining 105 test failures in board.spec.ts @km/_orphan #bug #P0

After fixing singleton removal regressions (@km/_orphan/remove-singleton-wrappers), 105 tests remain failing in board.spec.ts and related files.

## Analysis

These are NOT related to the singleton removal - they're separate issues:

### 1. Boundary/Edge Case Tests (~40 failures)

Tests that expect no visual effect but don't use `{ allowNoEffect: true }`:

- Empty states (empty board, empty column, single card)
- Boundary navigation (k at top, j at bottom, h at left, l at right)
- g/G at first/last card (already at boundary)
- Detail pane/history boundaries
- Folding boundaries

**Fix**: Add `{ allowNoEffect: true }` option to press() calls in boundary tests.

### 2. Empty Board Message Not Rendering (~2 failures)

Tests expect "Empty board" message but it's not displayed:

- "empty board shows helpful message" test fails
- Board shows just the header instead of helpful message

**Fix**: Investigate BoardCore empty state rendering logic.

### 3. Complex Interactions (~20 failures)

- Zooming (nested zoom, Escape after zoom, cursor position)
- History navigation ([ and ] keys, cursor restoration)
- Folding (z key toggle, fold count indicators)
- View mode switching

**Fix**: Requires investigation per feature.

### 4. Positioning Assertions (~10 failures)

- curswantX/curswantY (horizontal/vertical position memory)
- boundingBox assertions off by 1-2 pixels

**Fix**: May need tolerance adjustments or implementation fixes.

## Test Results

- Before fixes: 2645 pass / 116 fail
- After singleton removal fixes: 2656 pass / 105 fail
- board.spec.ts specifically: 49 pass / 38 fail

The 49 passing tests prove the command system IS working - the failures are implementation/assertion issues, not infrastructure bugs.

## Next Steps

1. Run board.spec.ts and categorize all 38 failures by type
2. Fix boundary tests first (add allowNoEffect flags) - quick wins
3. Fix empty board rendering
4. Tackle complex interactions one at a time

