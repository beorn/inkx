---
mentions:
  - km
id: "@km/cmd/5-migrate-task-status-commands"
aliases:
  - km-cmd.5
  - km-cmd-5
  - "@km/cmd/5"
created_at: 2026-01-17T23:24:01Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Migrate task/status commands @km/cmd #task #P2

## Commands to Migrate

### Status Toggle

- cycle_task_status (Space): todo → wip → done → dropped → todo
- toggle_task_done (x): toggle done/todo

### Direct Status Set

- set_status_todo/wip/blocked/done/dropped

## Acceptance Criteria

- [ ] All task commands in @km/commands
- [ ] Status cycle logic as reusable utility
- [ ] Works for single and multi-selected nodes
- [ ] Unit tests

