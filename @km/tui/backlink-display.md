---
mentions:
  - km
id: "@km/tui/backlink-display"
aliases:
  - km-tui.backlink-display
  - km-tui-backlink-display
created_by: claude:36393b5d
created_at: 2026-02-19T15:37:51Z
closed_at: 2026-02-19T16:56:18Z
owner: bjorn@stabell.org
---

# [x] Detail pane backlinks: show breadcrumb + title instead of raw block IDs @km/tui #bug #P2

Backlinks in the detail pane currently show raw block IDs. Should display as breadcrumb path + bolded title, e.g.: asana / family / **Task Title**. Uses getProjectPath() for the breadcrumb and getNodeDisplayName() for the title.

