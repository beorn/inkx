---
mentions:
  - km
  - claude
id: "@km/tui/header-j-scroll"
aliases:
  - km-tui.header-j-scroll
  - km-tui-header-j-scroll
created_by: claude:717696c0
created_at: 2026-02-15T22:20:07Z
closed_at: 2026-02-17T22:05:48Z
owner: bjorn@stabell.org
assignee: claude:5770ce77
---

# [x] j from board header enters off-screen column without scrolling to it @km/tui #bug #P3 @claude:5770ce77

When cursor is at board header level and user presses j, cursor enters the first column (by sort order) which may be off-screen. The view does NOT scroll to show it — cursor is 'lost' for one keypress until the user presses h/l. Expected: view should scroll to show whichever column the cursor enters.

