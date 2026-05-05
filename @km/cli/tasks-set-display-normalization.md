---
id: "@km/cli/tasks-set-display-normalization"
aliases:
  - km-cli.tasks-set-display-normalization
  - km-cli-tasks-set-display-normalization
created_by: claude:f9eb64dc
created_at: 2026-05-05T23:18:00Z
type: task
priority: P3
status: todo
parent: km-cli
---

# [ ] Display normalized date alongside input in tasks set/clear output @km/cli #task #P3

Wave 7 shipped natural-language date parsing in `set-clear-plan.ts` (planner returns `{ iso, humanized }`). The action handler in `apps/km-cli/src/commands/tasks/set-clear.ts` doesn't use the normalized form yet — it just prints `Updated due, status: <id>`.

Target output:

```
$ km task set foo due:tmrw
✓ Updated due:
  due: 2026-05-06 (tomorrow)
  foo
```

## Fix

In `apps/km-cli/src/commands/tasks/set-clear.ts` action handler, after the planner returns:
1. Pull each updated date field's normalized form from `plan.updates`
2. Render alongside the user's input as `<key>: <iso> (<humanized>)`
3. Apply for `due_at`, `start_at`, and any other date fields

The `humanized` value is in the planner output (added in commit `ec8249bb1`). Wire through.

## Acceptance

- [ ] `km task set foo due:tmrw` prints the normalized form alongside
- [ ] `km task set foo due:friday` shows weekday name + ISO
- [ ] `km task set foo due:eod` shows end-of-day ISO
- [ ] Test pinning the display in set-clear.test.ts (or a new display-format test)

## Why P3

Cosmetic delight; planner-layer correctness already shipped (Wave 7 commit ec8249bb1). User won't notice the difference until they want to confirm the parse. Easy to land once set-clear.ts is free of in-flight agents.

## Surfaced by

Wave 7 agent (a11eeca07fb3b66df) — couldn't land it because `apps/km-cli/src/commands/tasks/set-clear.ts` was forbidden in their scope.
