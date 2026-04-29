---
id: "@km/tui/col-shift"
aliases:
  - km-tui.col-shift
  - km-tui-col-shift
created_by: claude:a5c7f7de
created_at: 2026-02-15T14:26:31Z
closed_at: 2026-02-15T23:22:03Z
---

# [x] Column shift (opt+h/opt+left) doesn't work: log-only or boundary error @km/tui #bug #P2 @claude:a5c7f7de

Column shift (Meta+h/Meta+l) has two bugs:

**Bug 1: Crash with body column** — moveColumn() tries repo.moveNode('__body__board') on synthetic node. Crashes with 'Node __body__board not found'. Fix: check targetCol.isVirtual → return boundary().

**Bug 2: Meta+h loses cursor tracking** — Meta+l (shift right) works correctly through 7+ consecutive shifts. Meta+h (shift left) loses cursor and lands on wrong column. Root cause: stale layout.colIndex in action context after previous shifts. The second shift computes targetIndex from pre-shift positions.

**TTY confirmed**: On real vault /tmp/vt (120x40), shifting 'Next Actions' right 7 times works perfectly. Shifting back left 8 times ends up on 'Journals.base' instead. Screenshots: /tmp/explore-screenshots/41-47.

**Additional rendering issues**: Narrow columns render text vertically letter-by-letter instead of truncating. Horizontal line artifacts at bottom during heavy scroll.

**Files to fix**: apps/@km/tui/src/board/board-actions-edit.ts (moveColumn + normalizeColumnSortOrders)
**Failing tests**: apps/@km/tui/tests/col-shift-body.test.ts (1/8), .explore-tests/colshift-cursor-tracking.test.ts (4/24)