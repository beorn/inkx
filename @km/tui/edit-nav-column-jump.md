---
id: "@km/tui/edit-nav-column-jump"
aliases:
  - km-tui.edit-nav-column-jump
  - km-tui-edit-nav-column-jump
created_by: Bjørn Stabell
created_at: 2026-04-06T19:18:02Z
closed_at: 2026-04-06T20:04:23Z
close_reason: "Fixed: 55b3e42f8 — down direction drills into first child"
owner: bjorn@stabell.org
---

# [x] [bug] Ctrl+N from last card in column jumps to next column header @km/tui #bug #P1

findAdjacentEditNode in board-actions.ts recurses up when no sibling exists. When on the last card in a column, it returns the next column node (header). The 'down' direction enters edit on the column header directly. The 'up' direction correctly drills into children via findDeepestLastDescendant. Fix: mirror the up behavior for down — when adjacent node has children, navigate to its first child.