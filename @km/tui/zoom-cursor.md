---
mentions:
  - km
  - claude
id: "@km/tui/zoom-cursor"
aliases:
  - km-tui.zoom-cursor
  - km-tui-zoom-cursor
created_by: claude:499eee95
created_at: 2026-02-14T00:14:19Z
closed_at: 2026-02-14T07:59:54Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Cursor jumps to first column on zoom-in (i); should stay on same item @km/tui #bug #P1 @claude:124bfbe5

When pressing 'i' to zoom into a node (e.g., zooming into @next board from a parent board), the cursor jumps to the first column (e.g., 'Overdue') instead of staying on the item that was selected before zooming in. The cursor position should be preserved or at minimum positioned at the zoomed-into node's location within the board.

