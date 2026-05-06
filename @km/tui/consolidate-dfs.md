---
mentions:
  - km
  - Bjørn
id: "@km/tui/consolidate-dfs"
aliases:
  - km-tui.consolidate-dfs
  - km-tui-consolidate-dfs
created_by: Bjørn Stabell
created_at: 2026-04-02T22:26:10Z
closed_at: 2026-04-02T22:31:54Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Consolidate getVisibleColumnBlocks + getVisibleCardDescendants into getVisibleDescendants @km/tui #task #P2 @Bjørn Stabell

Same DFS walk algorithm with different root node. Extract shared getVisibleDescendants(rootId, viewIndex). ~30 min.

