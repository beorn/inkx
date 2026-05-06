---
mentions:
  - km
  - claude
id: "@km/tui/zoom-cursor-fallback"
aliases:
  - km-tui.zoom-cursor-fallback
  - km-tui-zoom-cursor-fallback
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:44:19Z
closed_at: 2026-02-14T22:48:06Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] u (zoom out) at repo root: move cursor up toward root instead of no-op @km/tui #bug #P2 @claude:a5c7f7de

When pressing 'u' to zoom out and the board is already at the repo root (can't go up further), the cursor should move up toward the repo root node instead of doing nothing.

