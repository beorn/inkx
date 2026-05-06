---
mentions:
  - km
  - claude
id: "@km/tui/click-hit"
aliases:
  - km-tui.click-hit
  - km-tui-click-hit
created_by: claude:fd695049
created_at: 2026-03-04T12:17:01Z
closed_at: 2026-03-04T13:09:44Z
owner: bjorn@stabell.org
assignee: claude:fd695049
---

# [x] Mouse click targeting unreliable — use DOM hit testing instead of Y-offset math @km/tui #bug #P1 @claude:fd695049

resolveMouseTarget() in board-app.ts uses manual Y-offset math to determine which block was clicked inside a card. This is unreliable because: (1) blockIndex is clamped to children.length (direct children only), so nested visible descendants map to the wrong node, (2) the Y-offset calculation assumes each child = 1 row, which breaks with variable-height content. inkx already has DOM-style hitTest() that walks the render tree and finds the deepest element at (x,y) using screenRect — just like web browsers. The fix: use hitTest to find the clicked element, then walk up to find the nearest node with an id prop. This replaces all manual coordinate math with reliable tree-based hit testing.

