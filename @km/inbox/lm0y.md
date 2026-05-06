---
mentions:
  - km
id: "@km/inbox/lm0y"
aliases:
  - km-lm0y
  - "@km/_orphan/lm0y"
created_at: 2026-01-14T23:07:57Z
closed_at: 2026-01-20T07:42:27Z
---

# [x] Refactor tasks.ts - 1100 lines with 15+ subcommands @km/_orphan #task #P3

## Refactor tasks.ts - 1108 lines with 15+ subcommands

**Status**: Backlog (P3) - Not blocking current work

**Current state** (2026-01-17): 1,108 lines, unchanged since creation.

## Analysis

Each subcommand should be its own file for maintainability.

## Recommended Structure

```
apps/km-cli/src/commands/
  tasks/
    index.ts       # Commander setup
    list.ts        # tasks list
    add.ts         # tasks add  
    update.ts      # tasks update/edit
    delete.ts      # tasks delete/rm
    move.ts        # tasks move
    ...
```

## When to Revisit

After TUI work stabilizes. This is code health, not blocking features.

