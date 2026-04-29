---
id: "@km/tui/done-color"
aliases:
  - km-tui.done-color
  - km-tui-done-color
created_by: claude:5f0aee02
created_at: 2026-02-18T08:40:07Z
closed_at: 2026-02-18T09:51:43Z
---

# [x] Completed task metadata should not show colored due/start dates @km/tui #bug #P2 @claude:5f0aee02

When a task is marked done, metadata like due dates and start dates still render with their color coding (red for overdue, green for future). This doesn't make sense — completed tasks should show these as dim/gray since the dates are no longer relevant.