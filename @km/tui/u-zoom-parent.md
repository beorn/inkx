---
id: "@km/tui/u-zoom-parent"
aliases:
  - km-tui.u-zoom-parent
  - km-tui-u-zoom-parent
created_by: claude:717696c0
created_at: 2026-02-15T22:16:28Z
closed_at: 2026-02-15T22:51:57Z
---

# [x] u (zoom out): cursor should go to PARENT not PREV when board can't move @km/tui #bug #P2 @claude:717696c0

When pressing 'u' (zoom_outwards):
- When zoomed in: correctly zooms out (good)
- At card level (no zoom): falls back to k (cursor up) — goes to column header
- At column header (no zoom): falls back to k — goes to board level
- At board level: stays, bells

User expects: when u can't zoom out, it should go to PARENT in the tree hierarchy (e.g., card → column that contains it). Currently it falls back to k (visual up), which may go to column header but could also go to prev sibling depending on cursor position.

Code: board-actions-zoom.ts lines 69 and 90 — handleZoomOut falls back to handleCursorMove('up') when already at root.

Reported 4-5 times by user. The distinction matters: 'k' = visual up, 'u' = semantic parent in hierarchy.