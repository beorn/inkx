---
mentions:
  - km
id: "@km/cli/tasks-new-due-start-flags"
aliases:
  - km-cli.tasks-new-due-start-flags
  - km-cli-tasks-new-due-start-flags
created_by: claude:f9eb64dc
created_at: 2026-05-05T23:18:00Z
type: task
priority: P3
status: todo
parent: km-cli
closeReason: Shipped at 998db0879. Added .option('--due <date>') and
  .option('--start <date>') to tasks/index.ts; mutations.ts surfaces planner
  errors[] (red-print, exit 1). 6 new tests in tasks-new-flags.test.ts cover
  tmrw/friday/garbage for both flags. 0 tsc errors, 733/733 km-cli tests.
---

# [x] Wire --due / --start commander flags on tasks --new @km/cli #task #P3

Wave 7 added `due` / `start` parsing to `mutations-plan.ts` `PlanNewTaskOptions` (chrono-node-backed). The commander surface in `apps/km-cli/src/commands/tasks/mutations.ts` (or wherever `tasks --new` flags are registered) doesn't expose the new options as CLI flags yet — users can't pass `--due tmrw`.

## Fix

In the `tasks --new` command registration:

```typescript
.option("--due <date>", "Due date (natural language: tmrw, +2w, friday)")
.option("--start <date>", "Start date (natural language)")
```

The planner already parses both, returns `errors[]` for bad input (handle that in the action handler).

## Acceptance

- [ ] `km task new "Fix foo" --due tmrw --priority P0` creates a task with due_at = tomorrow's ISO
- [ ] `km task new "Foo" --start friday` works
- [ ] Bad input: `km task new "Foo" --due garbage` errors out with chrono-node's parse failure message
- [ ] Test in `apps/km-cli/tests/tasks-new-flags.test.ts` (or new test file)

## Why P3

The parser layer exists (Wave 7 commit `ec8249bb1`). This is the 2-line wiring to expose it. Easy to land once mutations.ts is free of in-flight agents.

## Surfaced by

Wave 7 agent (a11eeca07fb3b66df) — couldn't land because `apps/km-cli/src/commands/tasks/mutations.ts` was forbidden in their scope.

