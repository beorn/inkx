---
id: "@km/silvery/listview-core"
aliases:
  - km-silvery.listview-core
  - km-silvery-listview-core
created_by: claude:def7f8a1
created_at: 2026-03-17T07:13:12Z
closed_at: 2026-03-17T07:29:13Z
close_reason: "ListView.tsx (334 lines) merges VirtualView + VirtualList. New
  API: navigable, cursorIndex, onCursorIndexChange, getKey,
  ListItemMeta.isCursor. Old components are thin deprecated wrappers.
  useListItem.tsx created. 63 tests pass. Committed in worktree
  feat/listview-core."
---

# [x] ListView core: merge VirtualView + VirtualList @km/silvery #task #P1 @claude:def7f8a1

Phase 1: Merge VirtualView + VirtualList into unified ListView component with navigable sugar. Old components become thin wrappers (deprecated). Port all existing tests.