---
id: "@km/tui/kill-tuiboardstate"
aliases:
  - km-tui.kill-tuiboardstate
  - km-tui-kill-tuiboardstate
created_by: claude:36393b5d
created_at: 2026-02-19T13:28:53Z
closed_at: 2026-02-19T13:31:34Z
owner: bjorn@stabell.org
---

# [x] Slim down InitialBoardData — remove dead fields, keep as UI state bundle @km/tui #task #P2

InitialBoardData (formerly TUIBoardState) is useful as a bundled UI state type. But it currently has dead fields that are always hardcoded (visualMode, searchMode, helpMode, selectedNodes, searchQuery). Slim it to only live fields: rootId, rootPath, columns, collapsedColumns, collapsedNodeIds, foldedNodes. Keep as a single prop for passing UI state. Already partially done in commit 4f814dac (renamed + some fields removed). Verify no dead fields remain.