---
id: "@km/_orphan/nav-visual-scroll"
aliases:
  - km-nav-visual-scroll
created_at: 2026-01-23T11:44:10Z
closed_at: 2026-01-23T21:39:29Z
---

# [x] Regression: Visual nav and scroll-to-cursor broken @km/_orphan #bug #P1

# Visual Navigation Issue - Investigation Results

## Summary

Visual navigation (h/l for cross-column movement) has a **fundamental design flaw**: it compares Y coordinates across columns assuming they are screen-relative, but they are actually content-relative (relative to each column's scroll container).

## Root Cause Analysis

### Issue 1: Content vs Screen Coordinates

The `useLayoutCallback` hook in inkx returns `node.computedLayout` which contains Y positions relative to the parent's **content area**, not the screen.

When Column A and Column B have different scroll positions:
- Card in Column A at content Y=100 might be visually at screen row 5
- Card in Column B at content Y=100 might be visually at screen row 15
- The visual navigation code assumes Y=100 in both columns means the same visual position

Per docs/06-ui.md line 569: `curswantY: number | null; // Sticky Y coordinate (screen row) for cross-column`

The documentation says "screen row" but the implementation uses content positions.

### Issue 2: Fallback Triggers on Edge Cases

The code at board-actions.ts:510-522 falls back to index-based navigation when:
```typescript
if (!hasCurrentPositions || !hasTargetPositions) {
  // Fall back to same card index
}
```

This triggers when:
1. Target column is not rendered (horizontally scrolled off-screen)
2. Cards haven't registered positions yet (first render race condition)
3. Registry is null (outside LayoutProvider - shouldn't happen)

### Issue 3: Scroll-to-Cursor

This likely works correctly for within-column navigation but may fail for cross-column navigation if the target card index from visual navigation is wrong.

## Debug Logging Added

Added debug statements in board-actions.ts:
- `km:tui:nav` namespace
- Logs when fallback triggers with registry dump
- Logs successful visual navigation with curswantY values

## Proposed Fixes

### Option A: Track Scroll Offsets (Complex but Correct)
- Store each column's scroll offset in the registry
- Convert curswantY to screen Y: `screenY = contentY - columnScrollOffset`
- When searching target column: `targetContentY = screenY + targetColumnScrollOffset`

### Option B: Use Visual Row Position (Simpler UX)
- Track relative visual position: "2nd visible card" instead of pixel Y
- Navigate to same relative position in target column
- More intuitive for users, doesn't require scroll offset tracking

### Option C: Accept Limitation
- Document that visual navigation is accurate only when columns have similar scroll positions
- Keep index-based fallback for edge cases
- Focus on making fallback less jarring

## Recommended Fix

**Option B** is recommended:
1. Most users expect "same visual row" behavior, not "same pixel Y"
2. Doesn't require complex scroll offset tracking
3. Works correctly regardless of scroll positions
4. Implementation is simpler

## Files Changed (Debug Only)

- `apps/km-tui/packages/km-ink/src/board-actions.ts` - Added debug logging for navigation
