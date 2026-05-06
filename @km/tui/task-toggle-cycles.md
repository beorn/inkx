---
mentions:
  - km
  - Bjørn
id: "@km/tui/task-toggle-cycles"
aliases:
  - km-tui.task-toggle-cycles
  - km-tui-task-toggle-cycles
created_by: Bjørn Stabell
created_at: 2026-04-06T20:42:25Z
closed_at: 2026-04-06T21:04:35Z
close_reason: Split TASK_SET_STATUS (explicit status for
  toggle_task_done/set_status_*) from TASK_CYCLE_STATUS (per-card cycle for
  cycle_task_status). Commit f08bd8237.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] x key cycles task status instead of toggling done — TASK_SET_STATUS ignores status field @km/tui #bug #P1 @Bjørn Stabell

Repro: press x on a todo task. Expected: toggle to done. Actual: cycles through todo→wip→blocked→done→dropped→todo.

Root cause: handleTaskStatusCycle in board-actions-edit.ts:486-502 always cycles via hardcoded statusCycle array, ignoring the status field on the op. Both toggle_task_done and cycle_task_status produce TASK_SET_STATUS ops, so they behave identically. set_status_todo/wip/blocked/done/dropped also broken via this dispatch path.

Mouse click works (CheckboxIcon.tsx calls repo.updateNode directly), keyboard shortcuts go through the broken dispatch.

