---
id: "@km/inbox/lzbz"
aliases:
  - km-lzbz
  - "@km/_orphan/lzbz"
created_at: 2026-01-19T15:22:54Z
closed_at: 2026-01-19T15:34:14Z
---

# [x] Add tests for km-board navigation selectors @km/_orphan #task #P2

## Problem

The navigation selectors in `packages/km-board/src/selectors.ts` have no test coverage:

- `getCurrentNode()` - Get currently selected node
- `getParentNode()` - Get parent of current node  
- `getSiblings()` - Get siblings at current level
- `getCurrentIndex()` - Get current index in siblings
- `canNavigateUp()` - Check if can move to previous sibling
- `canNavigateDown()` - Check if can move to next sibling
- `canNavigateParent()` - Check if can move to parent
- `canNavigateChild()` - Check if can move to first child

Note: The column/card selectors ARE tested (pathToColumnIndices, getCurrentColumn, etc.)

### Impact

Navigation bugs won't be caught by tests. These functions are used throughout the TUI.

### Fix

Add tests to `packages/km-board/tests/boardReducer.test.ts` or create new `selectors.test.ts`.