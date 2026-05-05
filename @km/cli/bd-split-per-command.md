---
id: "@km/cli/bd-split-per-command"
aliases:
  - km-cli.bd-split-per-command
  - km-cli-bd-split-per-command
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: task
priority: P2
status: todo
parent: km-cli
---

# [ ] Split bd.ts (1409 LOC, 25 commands) per-command following bd-format/bd-config precedent @km/cli #task #P2

`apps/km-cli/src/commands/bd.ts` is 1409 lines after the code-quality agent's extraction of `relocateBeadSiblingTree`. It contains ~25 inline subcommand action handlers (30-100 lines each).

The extracted shape already exists for cross-cutting modules: `bd-format.ts`, `bd-config.ts`, `bd-migrate.ts`, `bd-memory.ts`, `bd-comment.ts`, `bd-doctor.ts`, `bd-agent.ts`. The pattern just hasn't been applied to the action handlers themselves.

## Goal

One file per subcommand (or per command-family). Acceptance handlers become `bd-create.ts`, `bd-update.ts`, `bd-rename.ts`, `bd-close.ts`, `bd-claim.ts`, `bd-list.ts`, `bd-show.ts`, etc. Each file exports a named function (e.g., `bdCreateAction`) that gets wired up in `bd.ts`.

`bd.ts` itself becomes a thin command-registration shell (~200 LOC).

## Acceptance

- [ ] `bd.ts` ≤ 300 LOC, mostly `.command(...).action(...)` registrations
- [ ] Each `bd-*` action file is testable in isolation (pure planner pattern from `tasks/*-plan.ts` extends here)
- [ ] No silvery-chain transitive imports in any `bd-*-plan.ts` (if planners are extracted)
- [ ] Existing tests still pass (bd-create, bd-move-alias, bd-path-form-id, etc.)
- [ ] New unit tests for the extracted planners — minimum one per command

## Why this matters (L4 angle)

This is part of `@km/cli/task-bd-collapse` Wave 6 — the bd→task alias layer. Before bd can become a thin argv-translator that delegates to `km task`/`km`, the action logic in bd.ts has to be extractable. Without this split, the alias layer would have to keep calling into the monolithic `bd.ts`.

This is also a chain-immunity gate: tests for individual bd subcommands should NOT have to load `bd.ts` (which transitively pulls every km-cli command). Testing `bd-create` in isolation must be possible.

## Risk / blast radius

`bd.ts` has ~25 commands. Naive split = 25 new files. Consider command families:
- Display: `bd-list.ts`, `bd-show.ts`, `bd-children.ts`, `bd-blocked.ts`, `bd-ready.ts` — share rendering helpers
- Mutation: `bd-create.ts`, `bd-update.ts`, `bd-rename.ts`, `bd-close.ts`, `bd-drop.ts`, `bd-claim.ts`
- Inspection: `bd-info.ts`, `bd-where.ts`, `bd-stale.ts`, `bd-orphans.ts`, `bd-query.ts`
- Graph: `bd-dep.ts` (with sub-actions add/rm/ls)

12-15 files is more reasonable than 25.

## Surfaced by

Code-quality agent flagged this as P1 in session f9eb64dc. Holds back the bd→task collapse from completing.
