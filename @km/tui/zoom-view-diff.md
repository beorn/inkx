---
mentions:
  - km
  - claude
id: "@km/tui/zoom-view-diff"
aliases:
  - km-tui.zoom-view-diff
  - km-tui-zoom-view-diff
created_by: claude:124bfbe5
created_at: 2026-02-12T22:08:39Z
closed_at: 2026-02-14T08:06:55Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Cards view looks different when zoomed into .md file vs board root — borders gone @km/tui #bug #P3 @claude:124bfbe5

When zooming into a .md file (e.g., @next), the cards view renders differently than at the board root — card borders disappear. Check /tmp/vt, look at root board, then press 'i' to zoom into @next. The visual difference suggests that the view mode or card rendering differs based on zoom context.

