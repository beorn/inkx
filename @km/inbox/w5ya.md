---
id: "@km/inbox/w5ya"
aliases:
  - km-w5ya
  - "@km/_orphan/w5ya"
created_at: 2026-01-19T15:53:38Z
closed_at: 2026-01-19T15:53:42Z
---

# [x] InkX: Fix changesToAnsi cursor tracking bug @km/_orphan #bug #P2

## Problem
After the first render, incremental updates showed character doubling (e.g., "In Progress" became "In Progressss", "Done" became "Donene"). This occurred when navigating in the kanban example.

## Root Cause
The cursor position tracking in `changesToAnsi()` was incorrect. The logic for determining when to emit cursor movement commands was flawed.

## Fix Applied
Added a `firstCell` flag to properly handle the initial cursor positioning:
```typescript
let firstCell = true;
for (const { x, y, cell } of changes) {
    if (firstCell || y !== cursorY || x !== cursorX) {
        output += optimalCursorMove(cursorX, cursorY, x, y);
        firstCell = false;
    }
    // ...
    cursorX = x + (cell.wide ? 2 : 1);
    cursorY = y;
}
```

## Files Changed
- `vendor/beorn-inkx/src/output.ts` - Fixed cursor tracking in `changesToAnsi()`

## Status
Fix implemented. Unit tests of the diff and cursor positioning show correct behavior.
However, the bug still manifests in ttyd/xterm.js during navigation - may be a separate issue.