---
id: "@km/tui/implicit-task"
aliases:
  - km-tui.implicit-task
  - km-tui-implicit-task
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:54:21Z
closed_at: 2026-02-15T09:07:13Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Nodes with task properties (due_date, priority, etc.) are implicitly tasks @km/tui #feature #P3 @claude:a5c7f7de

Expand isTask computation: any node with task-semantic properties (due_date, scheduled_date, priority, assigned_to, recurrence) should be considered a task, not just nodes with task_marker (checkbox). This is a semantic signal — a heading with @due is conceptually a task even without a checkbox. Don't auto-add checkbox markers; just widen the isTask computed flag in TNode. Affects: @km/_orphan/core types.ts (isTask computation), any code filtering on isTask.