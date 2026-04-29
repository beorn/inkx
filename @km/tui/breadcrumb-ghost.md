---
id: "@km/tui/breadcrumb-ghost"
aliases:
  - km-tui.breadcrumb-ghost
  - km-tui-breadcrumb-ghost
created_by: claude:5f0aee02
created_at: 2026-02-18T10:18:18Z
closed_at: 2026-02-19T10:54:30Z
owner: bjorn@stabell.org
---

# [x] Breadcrumb shows ghost prefix char from previous navigation target @km/tui #bug #P2

Breadcrumb shows 'ainbox' instead of 'inbox', 'CTaskNotes' instead of 'TaskNotes'. First char of previous nav target leaks into current breadcrumb. Confirmed at 120x40 and 80x24. Screenshot: /tmp/explore-screenshots/14-navigate-right.png