---
id: "@km/storage/column-order-persist"
aliases:
  - km-storage.column-order-persist
  - km-storage-column-order-persist
created_by: Bjørn Stabell
created_at: 2026-04-06T20:23:54Z
closed_at: 2026-04-16T01:50:23Z
close_reason: Fixed in ab086b508..e3d92db2d — .km/sibling-order.json persists
  user column order; discovery + reconciler read it on rebuild. 15 new tests
  including E2E.
owner: bjorn@stabell.org
---

# [x] Column move position not persisted across restart (delete state.db loses order) @km/storage #bug #P2

Column reorder via opt+h/opt+l only updates parent_idx in state.db. When the user deletes state.db (or imports from a fresh vault), all columns reset to filesystem alphabetical order because the FS reconciler assigns parent_idx=0 to every newly-discovered file/folder.

Fix options:
- Write column order to a board frontmatter manifest (km.columns: [...])
- Use a sidecar .km/columns.json
- Embed parent_idx in a folder/file naming convention

Spawned from @km/tui/column-move while fixing the 'jumping' half.