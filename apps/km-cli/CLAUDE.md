# km-cli

The `km` command-line interface — workspace + scripting surface for the
knowledge machine. Wraps `@km/storage`, `@km/beads`, `@km/markdown`, and
the rest of the layer stack into a single `km <verb>` shape that
mirrors `gh`/`git`/`kubectl` ergonomics.

See the repo root [CLAUDE.md](../../CLAUDE.md) and
[docs/architecture.md](../../docs/architecture.md) for where this app
sits in the layer stack.

## Surface architecture (post-Wave 3 of @km/cli/task-bd-collapse)

The CLI is split into two parallel verb families:

| Surface        | Owns                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| km <verb>      | Generic node-graph verbs (set, clear, move, rename, children, stale, query, list, show, new, …)                     |
| km task <verb> | Task-workflow-specific verbs (board view, ready/blocked, claim/release/close/drop/reopen, dep)                      |
| km bd <verb>   | Beads-compatible on-ramp for users migrating from bd. Shared engine with km task / km; transitional, not permanent. |

The "tasks are nodes" mental model: anything generic to nodes lives at
top-level `km`. Only verbs that genuinely need task-domain knowledge
(workflow transitions, dep graph) live under `task`.

Naming: the command is **singular** — `km task`, not `km tasks`. The
`tasks` plural is preserved as an undocumented alias for muscle memory
(it does not appear in `--help`). This matches modern CLI conventions
(`gh issue`, `git branch`, `kubectl get pod`).

## Top-level `km` command inventory

This is the canonical list. **Read this before assuming a verb does or
doesn't exist.** Source of truth: `apps/km-cli/src/program.ts`.

### Generic node-graph verbs (operate on any node — task, doc, page, …)

| Command                       | What                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| km list / ls                  | List / search nodes with FTS + query DSL filtering                                |
| km show <id>                  | Show node details. --tree walks the subtree                                       |
| km new                        | Quick capture to inbox                                                            |
| km set <id...> field:value... | Generic field mutation; accepts multiple ids and field:value pairs                |
| km clear <id...> field...     | Generic field clear                                                               |
| km move <node> <parent>       | Re-parent a node (canonical engine; repo.moveNodeWithRefs rewrites incoming refs) |
| km rename <id> <target>       | Alias of km move (muscle memory)                                                  |
| km children <id>              | Alias of km show <id> -c                                                          |
| km stale [-d N]               | Any-node stale lister (untouched ≥ N days)                                        |
| km query <dsl>                | Alias of km list --raw <dsl>                                                      |
| km status <id> [new]          | View / set task status (single-field convenience over km set)                     |
| km add <target> <source...>   | Add tasks to a board/list                                                         |
| km open <id>                  | Open the markdown file for a node in $EDITOR (universal — any node)               |

### Task-workflow surface (singular `task`, alias `tasks`)

| Command                                  | What                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| km task                                  | Board view (open tasks, sorted by priority)                                                                                |
| km task ready                            | Todo + unblocked                                                                                                           |
| km task blocked                          | Tasks with at least one unresolved blocker                                                                                 |
| km task stale [-d N]                     | Untouched-≥N-days tasks                                                                                                    |
| km task orphans                          | Commit-referenced but still open                                                                                           |
| km task show <id>                        | Alias of km show <id> for ergonomics                                                                                       |
| km task new <title> [...]                | Create task with task-defaults (type=task); accepts --due, --start, --type, --id, --aliases, --parent, --priority, --owner |
| km task set <id> field:val               | Alias of km set with task-field validation                                                                                 |
| km task clear <id> field                 | Alias of km clear                                                                                                          |
| km task close <id> [--reason TEXT]       | Lifecycle: status=done + closed_at + reason                                                                                |
| km task drop <id> [--reason TEXT]        | Lifecycle: status=dropped + closed_at + reason                                                                             |
| km task reopen <id>                      | Lifecycle: done/dropped → todo (clears closed_at + assigned_to)                                                            |
| km task claim <id>                       | Lifecycle: status=wip + assigned_to=$USER (validates not-already-claimed-by-other)                                         |
| km task release <id>                     | Lifecycle: status=todo + clear assigned_to                                                                                 |
| km task dep add/rm/ls <id> <blockers...> | Manage blocked-by edges (Wave 5 via shared km link infra)                                                                  |

### Beads-compatible alias surface

`km bd <verb>` is the **migration on-ramp** for users coming from the standalone `bd` issue tracker. The path is:

1. `km import bd <vault>` — bring bd data into km
2. Use `km bd <verb>` in place of `bd <verb>` — same UX, no muscle-memory cost
3. Gradually migrate to `km <verb>` / `km task <verb>` (the canonical km surfaces)
4. Eventually `km bd` retires (post-v2; not soon)

This means `km bd` is **not a permanent parallel surface** — it's transitional. Implications for design:

- Where `km bd` and `km` overlap, the shared engine lives in `@km/*` packages (`@km/core`, `@km/storage`, `@km/beads`, `@km/agent`); `km bd` is a translation layer above the engine.
- `km bd` keeps bd-flavored UX (flag names, default-scope semantics, output formatting) — that's the point.
- `km` (general-purpose) doesn't need to mirror every `km bd` feature; it incorporates what makes sense for nodes-in-general, with km-shaped UX.
- L5 invariant: bd⇔task equivalence property test (`tests/bd-task-equivalence.property.test.ts`) pins state-equivalence on the verbs that share semantics.

`bd config` owns the issue-prefix knob (the bd-flavored config that selects which `@<prefix>/` paths bd treats as its issues). Full per-subcommand verdict matrix lives in [`hub/km/audit-km-tasks-vs-km-bd.md`](../../hub/km/audit-km-tasks-vs-km-bd.md).

### Workspace + I/O

| Command                       | What                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| km view [root]                | Interactive TUI (board/tree; press 'v' to toggle)                                                                                               |
| km init                       | Create .km/ for disk-mode storage                                                                                                               |
| km sync [--watch]             | Sync filesystem (one-shot or continuous)                                                                                                        |
| km watch                      | Deprecated alias for km sync --watch                                                                                                            |
| km doctor                     | Diagnose + repair stores                                                                                                                        |
| km daemon {start,stop,status} | Background daemon for ambient indexing                                                                                                          |
| km import <source> ...        | Asana / CSV / etc. importers. km import asana --fetch                                                                                           |
| km inbox                      | GTD-style inbox processing                                                                                                                      |
| km config [<key>[=<value>]]   | Generic config get/set (cosmiconfig walk-up + env-paths). Yes — this exists at top level via mountConfigCommand from @silvery/config/commander. |

### Diagnostics + meta

| Command                | What                               |
| ---------------------- | ---------------------------------- |
| km stats [path]        | Repo statistics                    |
| km screenshot [root]   | Capture TUI as text                |
| km perf analyze <file> | Performance trace analysis         |
| km termtest            | Visual terminal capability test    |
| km sh [root]           | Scripting shell for TUI2 debugging |
| km agent               | AI agent management                |

### Output convention (every list-shaped command should support)

- `--json` — JSON output
- `--jq <expr>` — filter JSON via jq expression (implies `--json`)
- `--all` — include done/dropped (where applicable)
- `-o short|wide|json` — output format

(Wave-of-work `@km/cli/json-jq-everywhere` brings these to commands that currently lack them.)

## Lifecycle vs `set` — the load-bearing distinction

After @km/cli/task-bd-collapse Wave 3, **lifecycle verbs are workflow
transitions, NOT raw field writes**. They have validation,
side-effects, and a distinct on-disk shape.

| Verb                 | Sets closed_at? | Validates source state?                              | Notes                                         |
| -------------------- | --------------- | ---------------------------------------------------- | --------------------------------------------- |
| task close <id>      | Yes (ISO now)   | Yes (rejects already-done)                           | Records optional --reason to data.closeReason |
| task drop <id>       | Yes (ISO now)   | Yes (rejects already-dropped)                        | Records optional --reason to data.dropReason  |
| task reopen <id>     | Clears it       | Yes (requires done/dropped)                          | Also clears assigned_to and reason markers    |
| task claim <id>      | (untouched)     | Yes (rejects claimed-by-other; rejects done/dropped) | Sets status=wip, assigned_to=$USER            |
| task release <id>    | (untouched)     | Yes (rejects unclaimed; rejects done/dropped)        | Clears assigned_to, sets status=todo          |
| set <id> status:done | No              | No                                                   | Raw field write — no closed_at, no validation |

**Why the distinction**: `set status:done` is the escape hatch for
power users who want a raw column write (e.g. fixing a corrupt status,
batch-importing). It deliberately does NOT touch `closed_at` so it
can't be confused with "this is the canonical 'I finished it' verb."
The lifecycle path (`task close`) is the canonical user-facing verb.

This is pinned by L4/L5 invariants in
[`apps/km-cli/tests/tasks-lifecycle-properties.test.ts`](tests/tasks-lifecycle-properties.test.ts):

- I1. `status === "wip"` ⟺ `assigned_to !== null` (claim pairs with owner)
- I2. `status === "done" || "dropped"` ⟺ `closed_at !== null` (close/drop pair with timestamp)
- I3. `status === "todo"` ⟺ `closed_at === null` (reopen always clears timestamp)
- I4. `set status:done` does NOT touch `closed_at`; `task close` always does

Property tests run 60 random sequences across two seeds (42 + 1234) of
length 5–20, asserting all four invariants after every step. Order-
dependent bugs that the L4 single-shot `applyLifecyclePlan` is supposed
to prevent by construction get caught here.

## Acceptance grep gates

Wave 3 invariants — these greps should produce ZERO matches:

```bash
# (1) The legacy top-level mutation flags must be gone from `task`.
grep -E '\.option\("--new <content>",' apps/km-cli/src/commands/tasks/index.ts
grep -E '\.option\("--done \[id\]",' apps/km-cli/src/commands/tasks/index.ts
grep -E '\.option\("--claim",' apps/km-cli/src/commands/tasks/index.ts
grep -E '\.option\("--release",' apps/km-cli/src/commands/tasks/index.ts
grep -E '\.option\("--assign <user>",' apps/km-cli/src/commands/tasks/index.ts

# (2) The legacy mutation handlers (claimTask/releaseTask/markDone/assignTask)
# must be gone from `tasks/mutations.ts` — replaced by lifecycle.ts.
grep -E '^export async function (claimTask|releaseTask|markDone|assignTask)\b' apps/km-cli/src/commands/tasks/mutations.ts

# (3) Lifecycle verbs must use Bead.close/drop/reopen (workflow transitions),
# never a raw `repo.updateNode` with `item.task.status:"done"` and no closed_at.
# This is harder to grep for — covered by the invariant property tests.
```

## Pure planner pattern

Every command that has non-trivial validation logic splits into:

- `<verb>-plan.ts` — pure planner; takes inputs, returns `{ errors, …update fields }`.
  No I/O, no `repo.updateNode`, no terminal output, no `process.exit`.
- `<verb>.ts` — action handler; loads repo, calls planner, applies update,
  emits output. Owns commander wiring and `process.exit` semantics.

Wave 3 added `lifecycle-plan.ts` + `lifecycle.ts` to this pattern.
Existing pairs: `mutations-plan.ts`/`mutations.ts`,
`set-clear-plan.ts`/`set-clear.ts`, `status-plan.ts`/`status.ts`,
`stale-plan.ts`/`stale.ts`, `list-plan.ts`/`list.ts`, `dep-plan.ts`/`dep.ts`.

L4 evidence: the planner unit tests import `<verb>-plan.ts` directly
and never transitively pull `program.ts → @silvery/ag-react/ui/*`.
Tests pass even while silvery is mid-flight in vendor.

## Tests

| Layer          | Where                                       | What                                                           |
| -------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Pure planner   | apps/km-cli/tests/<verb>-plan.test.ts       | Validation logic, error messages, field shapes                 |
| Action handler | apps/km-cli/tests/<verb>.test.ts            | Planner + storage writer integration                           |
| Property/fuzz  | apps/km-cli/tests/<verb>-properties.test.ts | L5 — random sequences, invariant pinning                       |
| mdspec         | apps/km-cli/tests/<verb>.spec.md            | Command output, end-to-end, with memory: true for in-memory DB |

```bash
bun vitest run apps/km-cli/tests/                              # all
bun vitest run apps/km-cli/tests/tasks-lifecycle-properties.test.ts  # this file
```

## See Also

- [@km/cli/task-bd-collapse](../../@km/cli/task-bd-collapse.md) — parent epic
- [packages/km-beads/CLAUDE.md](../../packages/km-beads/CLAUDE.md) — Bead namespace, lifecycle primitives (close/drop/reopen)
- [.claude/skills/tests/CLAUDE.md](../../.claude/skills/tests/CLAUDE.md) — TDD workflow
