---
id: "@km/tui/zoom-exit-j"
aliases:
  - km-tui.zoom-exit-j
  - km-tui-zoom-exit-j
created_by: claude:a5c7f7de
created_at: 2026-02-14T16:27:05Z
closed_at: 2026-02-14T21:12:38Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] TUI: 'j' on Inbox header inside zoomed @next exits zoom entirely @km/tui #bug #P2 @claude:a5c7f7de

After zooming into @next, navigating right to Inbox column header, pressing 'j' exits the zoom entirely and returns to root vault level. Expected: cursor moves to first Inbox item. 100% reproducible. Screenshots at /tmp/explore-screenshots/13,14.