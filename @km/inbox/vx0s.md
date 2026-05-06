---
mentions:
  - km
  - km
id: "@km/inbox/vx0s"
aliases:
  - km-vx0s
  - "@km/_orphan/vx0s"
created_at: 2026-01-17T23:20:15Z
closed_at: 2026-01-17T23:22:46Z
---

# [x] [km-cmd.5] Migrate task/status commands to @km/commands @km/_orphan #task #P2

## Goal

Move all task status commands to the unified command registry.

## Commands to Migrate

### Status Toggle

- `cycle_task_status` - cycle through statuses (Space)
- `toggle_task_done` - toggle between done/todo (x)

### Direct Status Set

- `set_status_todo`
- `set_status_wip`
- `set_status_blocked`
- `set_status_done`
- `set_status_dropped`

## Source Files

- `apps/km-tui/packages/km-ink/src/views/Board.tsx` - Space key handler
- `apps/km-repl/src/commandParser.ts` - SET_STATUS shell command
- `archive/km-opentui/src/commands.ts` - proven pattern

## Status Cycle Logic

```typescript
// todo → wip → done → dropped → todo
function getNextStatus(current: TaskStatus | null): TaskStatus {
  switch (current) {
    case "todo": return "wip";
    case "wip": return "done";
    case "done": return "dropped";
    case "dropped": return "todo";
    default: return "todo";
  }
}
```

## Implementation

```typescript
export const cycleTaskStatus: CommandDef = {
  id: "cycle_task_status",
  name: "Cycle Status",
  description: "Cycle through task statuses",
  category: "Task",
  execute: (ctx) => {
    if (\!ctx.currentNodeId || \!ctx.currentNode?.is_task) return null;
    const newStatus = getNextStatus(ctx.currentNode.task_status);
    return {
      type: "UPDATE_NODE",
      nodeId: ctx.currentNodeId,
      updates: { task_status: newStatus },
    };
  },
};

export const setStatusDone: CommandDef = {
  id: "set_status_done",
  name: "Set Done",
  description: "Mark task as done",
  category: "Task",
  execute: (ctx) => {
    if (\!ctx.currentNodeId) return null;
    return {
      type: "UPDATE_NODE",
      nodeId: ctx.currentNodeId,
      updates: { task_status: "done" },
    };
  },
};
```

## Acceptance Criteria

- [ ] All task commands registered in @km/commands
- [ ] Commands return TAction (UPDATE_NODE)
- [ ] Status cycle logic is reusable utility
- [ ] Unit tests for each command
- [ ] Works for both single and multi-selected nodes

