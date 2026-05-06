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

| Surface           | Owns                                                         |
| ----------------- | ------------------------------------------------------------ |
| `km <verb>`       | Generic node-graph verbs (`set`, `clear`, `move`, `rename`, `children`, `stale`, `query`, `list`, `show`, `new`, …) |
| `km task <verb>`  | Task-workflow-specific verbs (board view, ready/blocked, claim/release/close/drop/reopen, dep) |
| `km bd <verb>`    | Beads-compatible legacy surface; thin alias layer over `km task` / `km` (Wave 6) |

The "tasks are nodes" mental model: anything generic to nodes lives at
top-level `km`. Only verbs that genuinely need task-domain knowledge
(workflow transitions, dep graph) live under `task`.

Naming: the command is **singular** — `km task`, not `km tasks`. The
`tasks` plural is preserved as an undocumented alias for muscle memory
(it does not appear in `--help`). This matches modern CLI conventions
(`gh issue`, `git branch`, `kubectl get pod`).

## Lifecycle vs `set` — the load-bearing distinction

After @km/cli/task-bd-collapse Wave 3, **lifecycle verbs are workflow
transitions, NOT raw field writes**. They have validation,
side-effects, and a distinct on-disk shape.

| Verb                          | Sets `closed_at`? | Validates source state? | Notes |
| ----------------------------- | ----------------- | ----------------------- | ----- |
| `task close <id>`             | Yes (ISO now)     | Yes (rejects already-done) | Records optional `--reason` to `data.closeReason` |
| `task drop <id>`              | Yes (ISO now)     | Yes (rejects already-dropped) | Records optional `--reason` to `data.dropReason` |
| `task reopen <id>`            | Clears it         | Yes (requires done/dropped) | Also clears assigned_to and reason markers |
| `task claim <id>`             | (untouched)       | Yes (rejects claimed-by-other; rejects done/dropped) | Sets status=wip, assigned_to=$USER |
| `task release <id>`           | (untouched)       | Yes (rejects unclaimed; rejects done/dropped) | Clears assigned_to, sets status=todo |
| `set <id> status:done`        | **No**            | **No**                  | Raw field write — no closed_at, no validation |

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

| Layer          | Where                                              | What                                  |
| -------------- | -------------------------------------------------- | ------------------------------------- |
| Pure planner   | `apps/km-cli/tests/<verb>-plan.test.ts`            | Validation logic, error messages, field shapes |
| Action handler | `apps/km-cli/tests/<verb>.test.ts`                 | Planner + storage writer integration  |
| Property/fuzz  | `apps/km-cli/tests/<verb>-properties.test.ts`      | L5 — random sequences, invariant pinning |
| mdspec         | `apps/km-cli/tests/<verb>.spec.md`                 | Command output, end-to-end, with `memory: true` for in-memory DB |

```bash
bun vitest run apps/km-cli/tests/                              # all
bun vitest run apps/km-cli/tests/tasks-lifecycle-properties.test.ts  # this file
```

## See Also

- [@km/cli/task-bd-collapse](../../@km/cli/task-bd-collapse.md) — parent epic
- [packages/km-beads/CLAUDE.md](../../packages/km-beads/CLAUDE.md) — Bead namespace, lifecycle primitives (close/drop/reopen)
- [.claude/skills/tests/CLAUDE.md](../../.claude/skills/tests/CLAUDE.md) — TDD workflow
