---
id: "@km/tui/activity-cards"
aliases:
  - km-tui.activity-cards
  - km-tui-activity-cards
created_by: claude:97b8de73
created_at: 2026-02-23T00:30:27Z
closed_at: 2026-02-23T12:38:33Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Activity/Comments sections still show as cards on the board @km/tui #bug #P2 @claude:97b8de73

The 'Activity' and 'Comments' sections from Asana imports still appear as cards on the board. These should be collapsed/hidden - they add visual clutter. The isCollapsedChild filter in use-columns.ts should catch these but apparently doesn't.