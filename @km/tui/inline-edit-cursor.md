---
mentions:
  - km
id: "@km/tui/inline-edit-cursor"
aliases:
  - km-tui.inline-edit-cursor
  - km-tui-inline-edit-cursor
created_by: claude:124bfbe5
created_at: 2026-02-14T08:46:21Z
closed_at: 2026-02-14T08:51:42Z
owner: bjorn@stabell.org
---

# [x] Pressing 'i' resets cursor position instead of keeping it on current node @km/tui #bug #P2

When pressing 'i' to enter inline edit mode, the cursor jumps to a different node instead of staying on the currently selected node. Expected: cursor remains on the same node, inline edit activates for that node. Actual: cursor position resets to some other location.

