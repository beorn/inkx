---
id: "@km/_orphan/zjy2"
aliases:
  - km-zjy2
created_at: 2026-01-15T22:31:38Z
closed_at: 2026-01-16T07:40:27Z
---

# [x] Extract AppState from TreeState into @km/tui @km/_orphan #task #P2

Extract modal/view config from TreeState into a separate AppState in @km/tui.

**TreeState → BoardState (@km/core):**
- cursor: CursorPath
- rootId, rootPath
- selectedNodes: Set<string>
- foldedNodes, collapsedNodes
- zoomStack, navHistory, navHistoryIndex
- searchQuery

**AppState (@km/tui):**
- helpOpen, searchOpen
- newItem: { open, text }
- projectPicker: { open, query, index }
- detailPaneOpen
- maxOutlineDepth, maxContentLines

**appReducer actions:**
- TOGGLE_HELP, TOGGLE_SEARCH
- TOGGLE_NEW_ITEM, SET_NEW_ITEM_TEXT
- TOGGLE_PROJECT_PICKER, SET_PICKER_QUERY
- PICKER_UP, PICKER_DOWN
- TOGGLE_DETAIL_PANE
- INCREASE/DECREASE_OUTLINE_DEPTH
- INCREASE/DECREASE_CONTENT_LINES

This separation enables reusable board logic across different UIs.