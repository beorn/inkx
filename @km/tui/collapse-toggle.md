---
id: "@km/tui/collapse-toggle"
aliases:
  - km-tui.collapse-toggle
  - km-tui-collapse-toggle
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:46:17Z
closed_at: 2026-02-14T21:46:30Z
---

# [x] collapse=true columns cannot be toggled off via 'c' key @km/tui #bug #P2

Board.tsx rendering checks col.rules?.collapse first, short-circuiting the store toggle. Fixed by making collapsedNodes store the single source of truth — rules.collapse is captured at init time via buildBoardState.