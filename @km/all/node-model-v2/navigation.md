---
id: "@km/all/node-model-v2/navigation"
aliases:
  - km-all.node-model-v2.navigation
  - km-all-node-model-v2-navigation
created_by: claude:36393b5d
created_at: 2026-02-19T01:25:53Z
closed_at: 2026-02-20T07:37:08Z
---

# [x] Navigation: cursorNodeId, navigateToNode, smart zoom @km/all #task #P2 @claude:8f007ba9

Simplify navigation from colIndex/cardIndex to cursorNodeId. Unified navigateToNode(), structure-aware zoom, input mode state machine.

Subsumes: @km/tui/visual-nav-migration, @km/tui/smart-zoom, @km/tui/navigate-to-node, @km/tui/input-mode-stack, @km/tui/scroll-to-selection, @km/tui/search-board, @km/tui/search-repaint, @km/tui/keys-as-text, @km/tui/breadcrumbs, @km/tui/deep-breadcrumbs, @km/tui/detail-fallback