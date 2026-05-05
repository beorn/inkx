---
id: "@km/cli/bd-rename-dep-dry-run"
aliases:
  - km-cli.bd-rename-dep-dry-run
  - km-cli-bd-rename-dep-dry-run
created_by: claude:f9eb64dc
created_at: 2026-05-05T23:18:00Z
type: task
priority: P3
status: todo
parent: km-cli
---

# [ ] Add --dry-run to bd rename and bd dep destructive verbs @km/cli #task #P3

Wave 7 shipped `--dry-run` for `km move`. `km set` already had it (Wave 4). Two destructive bd verbs are still missing it:

- `bd rename <old> <new>` — relocates parent file + sibling directory + rewrites references across vault. Definitely destructive.
- `bd dep add <id> <blocker>` / `bd dep rm <id> <blocker>` — modifies frontmatter. Less destructive but bulk operations should preview.

## Fix

In `apps/km-cli/src/commands/bd-rename.ts` (or wherever bd-split lands the rename action) and `apps/km-cli/src/commands/bd-dep.ts`:

1. Add `.option("--dry-run", "Show changes without writing")`
2. When `--dry-run`, emit the diff summary (file paths affected, ref-rewrite counts, fields changed) and exit without calling the mutation
3. Pattern to follow: `apps/km-cli/src/commands/move.ts` `--dry-run` (Wave 7 reference)

## Acceptance

- [ ] `bd rename foo bar --dry-run` prints rename + ref-rewrite preview, writes nothing
- [ ] `bd dep add foo bar --dry-run` prints would-add edge, writes nothing
- [ ] Test in `apps/km-cli/tests/bd-rename-dry-run.test.ts` and `bd-dep-dry-run.test.ts` (or extend existing bd tests)
- [ ] CI gate: any new destructive bd verb without `--dry-run` is a build failure (extend the gate from `@km/cli/task-bd-collapse` Wave 7 acceptance)

## Why P3

`bd rename` already prints "Would rename..." in some paths but doesn't have a true `--dry-run` flag that prevents writes. Adding the flag completes the dry-run invariant for all destructive verbs.

## Surfaced by

Wave 7 agent (a11eeca07fb3b66df) — couldn't land because bd*.ts was bd-split's territory and bd-split is still in flight. Once bd-split commits, this is small (per-file `--dry-run` flag).

## Pairs with

- `@km/cli/bd-split-per-command` — must land first; bd-split's per-command files are where the `--dry-run` flag goes.
