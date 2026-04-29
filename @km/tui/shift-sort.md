---
id: "@km/tui/shift-sort"
aliases:
  - km-tui.shift-sort
  - km-tui-shift-sort
created_by: claude:bca35d62
created_at: 2026-02-11T13:20:31Z
closed_at: 2026-02-11T13:32:57Z
owner: bjorn@stabell.org
assignee: claude:bca35d62
---

# [x] Shift down sends cards to bottom due to duplicate parent_idx @km/tui #bug #P2 @claude:bca35d62

When siblings have duplicate parent_idx values (e.g., all default to 0), the calculateSortOrder function computed fractional values between virtual sequential indices, but the actual DB sorts by real parent_idx. This caused the moved card to end up at the bottom of the column instead of the adjacent position.

Fix: Added normalizeSortOrders() that assigns sequential parent_idx [0,1,2,...] to column cards when duplicates are detected, called before any shift calculation in moveCardInColumn.