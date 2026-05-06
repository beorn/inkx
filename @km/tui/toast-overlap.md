---
mentions:
  - km
  - claude
id: "@km/tui/toast-overlap"
aliases:
  - km-tui.toast-overlap
  - km-tui-toast-overlap
created_at: 2026-02-05T16:58:18Z
closed_at: 2026-02-05T17:45:20Z
assignee: claude:b53ef7e4
---

# [x] Toast notification overlaps bottom status bar @km/tui #bug #P2 @claude:b53ef7e4

When a toast appears (e.g., 'N log messages — press ` to see'), it overlaps the bottom status bar instead of being positioned above it. The toast's absolute positioning doesn't account for the bottom bar height.

Screenshot: ~/Desktop/Screenshot 2026-02-05 at 16.56.31.png

The toast stack uses position=absolute with marginTop/marginLeft calculated from termHeight, but the estimatedHeight calculation may be off, or the bottomBarHeight=1 isn't sufficient to keep toasts above the bar.

