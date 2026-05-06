---
mentions:
  - km
id: "@km/tui/lens-filters"
aliases:
  - km-tui.lens-filters
  - km-tui-lens-filters
created_by: Bjørn Stabell
created_at: 2026-04-06T03:26:34Z
closed_at: 2026-04-06T03:37:24Z
close_reason: taskStatusFilter moved into createVisibleLens with 8 tests.
  hiddenNodeIds already at viewLens level. Text/property filters stay at Board
  level (transient UI state).
owner: bjorn@stabell.org
---

# [x] Move UI filters (hide-done, text search) into visible lens @km/tui #feature #P2

Board.tsx currently applies card-level filters (taskStatusFilter, text search, property filters) AFTER column derivation. This means ColumnView.cardNodes can't be replaced by ViewTree childIds — the ViewTree shows unfiltered cards.

Move these filters into createVisibleLens so that the ViewTree's childIds are already filtered. This:

1. Eliminates the Board.tsx card filtering layer
2. Enables Column to derive cards from ViewTree.childIds directly
3. Unblocks full ColumnView elimination (@km/tui/tree-lenses/4-migrate-board-tsx-column-views-to-usenode-viewtree)
4. Makes filtered state available to action handlers via ctx.tree

Filters to move:

- taskStatusFilter (hide done/dropped)
- filterText (text search)
- property filters (label, assignee, priority)
- hiddenNodeIds (vx hide item)

