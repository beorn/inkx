---
mentions:
  - km
  - claude
id: "@km/inbox/2zgmp"
aliases:
  - km-2zgmp
  - "@km/_orphan/2zgmp"
created_at: 2026-02-02T21:39:48Z
closed_at: 2026-02-02T21:45:43Z
assignee: claude:1588825b
---

# [x] Code review: VirtualList/scroll implementation improvements @km/_orphan #task #P2 @claude:1588825b

Deep code review findings for inkx VirtualList and @km/tui scroll implementation.

## Critical Issues (P1)

1. **Off-by-one in scroll-right** - VirtualList.tsx:115 has asymmetric +1 in right-edge calculation
2. **Stale scrollOffset race** - VirtualList.tsx:156-201 state can become stale when frozen

## Medium Issues (P2)

3. **stickyY not cleared on view change** - board-actions-nav.ts:140-143 - Y coords invalid across views
4. **Column freeze transitions** - scroll-helpers.ts:18-27 - scroll state diverges during rapid navigation
5. **getCardMidY fallback returns 0** - card-positions.ts:471-483 - dangerous for navigation

## Low Issues (P3)

6. **Inconsistent SCROLL_PADDING** - vertical=2, horizontal=1 (intentional?)
7. **Column header height edge case** - CardColumn.tsx:336

## Refactoring Opportunities

R1. Extract calcEdgeBasedScrollOffset (shared across 3 files)
R2. Create StickyPositionManager class for clearer lifecycle
R3. Define COLUMN_HEADER_INDEX constant (-1 magic number)
R4. Add comprehensive edge case tests for VirtualList

