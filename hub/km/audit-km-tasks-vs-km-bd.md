# km tasks vs km bd — Parity Audit

2026-04-28 · session: audit-D (`km-beads.rename-to-task`)

## Summary

- **`km bd` subcommands**: 24 (excluding `help`)
- **`km tasks` subcommands**: 5 + 6 root-flag operations (list, --new, --done, --claim, --release, --assign)
- **Semantic overlap (operate on the same node, with shared semantics)**: 8
- **Recommendation distribution**: stay 12 · port 4 · merge 4 · drop 0 · special 4

The two surfaces have grown independently. `km tasks` is a flag-and-positional-driven personal-task UX; `km bd` is a beads-shaped issue-tracking UX. They both ultimately mutate KNode tasks via `repo.updateNode` — but they diverge on identity (path-form bd id vs path-or-id), display (graph-aware grouping vs flat collapsed-ancestor tree), and surface (subcommand-rich vs flag-rich).

The biggest gap is in `km tasks`: no priority view, no assignee filtering as a first-class concept, no dependency graph, no parent/child traversal, no rename, and no JSON-DSL query. The biggest gap in `km bd`: no field-clear semantics, no `set k:v k:v` ergonomics, no path-as-filter (`km bd list projects`), and no in-place status-cycling via positional second arg.

The recommendation: **`km tasks` is the canonical task surface**; pull the genuinely general primitives (priority filtering, assignee filtering, blocked/unblocked, stale, children, dep) into `km tasks`. Keep bead-graph-and-workflow-specific commands (ready, agent, orphans, info/where, migrate/export, memories/prime, rename, query) in `km bd`. Two commands keep `km bd` semantics for now (create, update, close, drop) because they encode bd id structure; once the path-form id story is universal, those merge too.

## Per-subcommand verdict

| km bd subcommand | km tasks equivalent                   | Verdict | Rationale                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ready            | (none)                                | stay    | Bead-graph specific: returns issues that are unblocked AND in todo. km tasks doesn't model blockedBy, so this is fundamentally a bd query. Keep.                                                                                                                                                                                                                                                    |
| list             | tasks [query...]                      | merge   | Both list. km tasks is more ergonomic (status:todo @beorn #bug, path filter km tasks projects); km bd list has the unique --blocked/--unblocked/--limit/--all and DSL passthrough. Action: extend km tasks with --blocked/--unblocked/--limit/--priority/--assignee; have km bd list delegate to the same query builder under the hood.                                                             |
| show             | tasks <id> (auto-detail)              | merge   | km tasks already shows details when arg resolves to a single task. km bd show adds --json and richer formatting. Action: factor a shared printTaskDetails(node, {json, beadsView}) helper; km bd show uses beadsView=true for shortId/blockedBy/dependentCount.                                                                                                                                     |
| create           | tasks --new <content>                 | merge   | Both create. km bd create adds bd-specific structure: --type/--priority/--assignee/--label/--description/--notes/--id/--parent. km tasks --new parses inline metadata (@person, due:..). Action: keep both but consolidate the field-extraction layer. km tasks new <content> should accept the same flags (-p, -a, --type). km bd create stays as the named-id-aware variant.                      |
| update           | tasks set <id> k:v ... + tasks status | port    | km bd update is field-by-field with --status/--priority/--assignee/--title/--description/--notes/--type/--claim. Most of these are general-task fields. Action: port --type, --description, --notes, --claim into km tasks set (extend the field switch). km bd update keeps bd-specific semantics (description-as-first-paragraph, notes-as-appended-paragraph, currentData partial-update guard). |
| close            | tasks status <id> done                | merge   | km bd close --reason adds an audit reason field stored in the bd data blob. km tasks status done doesn't. Action: have tasks status done accept --reason; km bd close becomes tasks status done --reason ... --bd (or stays as a thin alias that injects bd close-fields semantics).                                                                                                                |
| drop             | tasks status <id> dropped             | merge   | Same shape as close. km bd drop --reason writes drop-fields. Action: same merge as close — tasks status dropped --reason.                                                                                                                                                                                                                                                                           |
| dep              | (none)                                | port    | Dependency graph is a general task concept (blocked-by). km calendar/notes don't use it today, but the storage layer supports it via data.blocked_by. Action: port dep add/remove/list to km tasks dep. Keep km bd dep as alias during cutover.                                                                                                                                                     |
| stale            | (none)                                | port    | "Tasks not updated in N days" is generic. Action: port to km tasks stale --days N. Keep km bd stale as alias.                                                                                                                                                                                                                                                                                       |
| orphans          | (none)                                | stay    | Bead-tracking specific: scans git log for bd ids in commits. Depends on the canonical km-<scope>.<slug> id form. Not meaningful for raw markdown tasks. Keep.                                                                                                                                                                                                                                       |
| claim            | tasks claim <id> / tasks --claim      | merge   | km bd claim resolves the assignee from git config user.name; km tasks claim uses process.env.USER. Action: unify on git-config-with-env-fallback, single shared helper. km bd claim becomes thin wrapper.                                                                                                                                                                                           |
| children         | (none)                                | port    | Listing children-of-a-task is generic, not bd-specific. The bd version is enriched (walks both in-file and folder-children for sub-issues), but the mechanism is fully usable for any task. Action: port to km tasks children <id>. The bd-specific path-folder walk lives in the formatter.                                                                                                        |
| blocked          | (none)                                | port    | "Tasks with blocked-by" is generic. Action: port to km tasks --blocked (already proposed above) or km tasks blocked. Keep km bd blocked as alias.                                                                                                                                                                                                                                                   |
| agent            | (none)                                | stay    | Agent work-queue (assign issues to agents, run agent on queue). Bead-and-workflow specific. Keep.                                                                                                                                                                                                                                                                                                   |
| info             | (none)                                | stay    | Beads configuration + per-status counts. Bd-specific. Keep.                                                                                                                                                                                                                                                                                                                                         |
| where            | (none)                                | stay    | Beads paths/db location. Bd-specific. Keep.                                                                                                                                                                                                                                                                                                                                                         |
| query            | tasks --query <q> / positional        | merge   | Both run a DSL query against the repo. km bd query has no default filter; km tasks injects -status:done by default. Action: have km tasks --query --raw skip the default filter (matches km bd query semantics). km bd query becomes a thin wrapper that sets --raw.                                                                                                                                |
| rename           | (none)                                | stay    | Bead-id-rewriting (canonical bd id form, wikilinks, blocked-by edges). Generic node rename is km move; this is the bd-aware variant. Keep.                                                                                                                                                                                                                                                          |
| config           | (none)                                | stay    | Bd configuration (prefix, etc.). Stay.                                                                                                                                                                                                                                                                                                                                                              |
| migrate          | (none)                                | stay    | One-shot Go-bd → km-bd migration. Stay.                                                                                                                                                                                                                                                                                                                                                             |
| export           | (none)                                | stay    | km issues → .beads/issues.jsonl. Stay.                                                                                                                                                                                                                                                                                                                                                              |
| remember         | (none)                                | stay    | Memories aren't tasks at all — different node type, different folder (mem/). Misplaced under km bd (semantically belongs at top-level), but don't move it to km tasks — it's not a task. Stay (or eventually promote to km mem remember).                                                                                                                                                           |
| memories         | (none)                                | stay    | Same as remember. Stay (or promote to km mem list).                                                                                                                                                                                                                                                                                                                                                 |
| prime            | (none)                                | stay    | Session-priming output (workflow context + recent memories). Bd-and-session specific. Stay.                                                                                                                                                                                                                                                                                                         |

## km tasks → km bd (the reverse direction)

| km tasks subcommand           | km bd equivalent                     | Verdict           | Rationale                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tasks (root listing)          | bd list                              | merge (see above) | km tasks is the canonical front; bd list delegates.                                                                                                                                       |
| tasks status <id> [s]         | bd update -s                         | port to bd        | Status-cycling-with-positional is more ergonomic than update -s wip. Have bd update <id> wip work too (positional second arg = status), or keep as just tasks status.                     |
| tasks set <id> k:v ...        | bd update -k v                       | port to bd        | set due:2025-01-20 priority:P1 is more ergonomic. Action: keep bd update for bd-specific notes/description/claim, but accept set-style positional fields too. Or have bd update delegate. |
| tasks clear <id> due priority | bd update -p "" (no real equivalent) | port to bd        | km bd update has no clear semantics — passing empty string isn't well-defined. Action: add bd update --clear due,priority.                                                                |
| tasks claim <id>              | bd claim <id>                        | merge (above)     | Already covered.                                                                                                                                                                          |
| tasks release <id>            | (none)                               | port to bd        | "Release" (clear assignee + reset to todo) is a useful inverse of claim. km bd has no release; you'd bd update --status todo --assignee ''. Action: add bd release <id>.                  |

## Biggest gaps (features one has, the other doesn't)

### Things `km bd` has that `km tasks` lacks

- `--blocked` / `--unblocked` filters
- `--priority` filter
- `--assignee` filter (km tasks uses `@person` query syntax — equivalent but not first-class)
- `--limit`
- Dependency graph (`dep add/remove/list`, `blocked`)
- `stale` (idle threshold)
- `children` (subtree walk)
- `ready` (unblocked + todo combined view)
- `--type` filter and field
- `rename` (id-aware refactor)
- `--description` / `--notes` (bd's append-vs-replace paragraph semantics)
- `--reason` on close/drop (audit field)

### Things `km tasks` has that `km bd` lacks

- `set k:v k:v` ergonomics (multi-field one-shot update)
- `clear` semantics (explicit field-removal)
- Positional path filter (`km tasks projects` finds tasks under any path containing "projects")
- Inline-metadata parsing on `--new` (extracts `@person`, `due:..`, `#tag` from the content string)
- Tree rendering with shared-ancestor collapsing (more readable than `bd list`)
- `--flat` mode (one-line breadcrumb-prefixed)
- `--detail` mode (richer per-task display)
- Status icons (✓ ● ✗ ○) in output

### Shared semantics that diverge

- **Assignee resolution**: `bd claim` uses `git config user.name`; `tasks claim` uses `process.env.USER`. Should unify.
- **Default status filter**: `tasks list` defaults to `-status:done`; `bd list` returns all statuses unless filtered. Should unify or document explicitly.
- **`--json` output shape**: bd emits a `bdJson` shape (shortId, status, blockedBy); tasks emits raw KNode. Should harmonize a `taskJson` shape with optional `bd:` extension.
- **ID resolution**: `bd resolveIssueArg` accepts shortId/path-form; `tasks findNodeByPathOrId` accepts ID-prefix/full-path/relative-path. Should converge on `repo.resolveNode(arg, {taskOnly?})`.

## Recommended action order

1. **Phase 1 — extract shared task primitives** (no behavior change):
- Move `findNodeByPathOrId` + `resolveIssueArg` into a single `repo.resolveTaskOrIssue(arg)` helper.
- Factor `printTaskDetails(node, {bd?: true})` shared by `bd show` and `tasks <id>`.
- Factor `claimTask` to use git-config-with-env-fallback consistently.
- Single source of truth for status icons.
7. **Phase 2 — port general primitives into `km tasks`**:
- `tasks --priority P1`, `tasks --assignee @beorn`, `tasks --blocked`, `tasks --unblocked`, `tasks --limit N`.
- `tasks dep add/remove/list <id> [<dep-id>]`.
- `tasks stale [--days N]`.
- `tasks children <id>` (without bd path-folder walk).
- `tasks release <id>` (already exists; just confirm).
14. **Phase 3 — extend `km tasks` set/clear**:
- `tasks set <id> type:bug description:"…" notes:"…"` (porting bd update fields where they make general sense).
- `tasks clear <id> due priority assigned`.
- `tasks status <id> done --reason "..."` (audit field).
19. **Phase 4 — make `km bd` thin wrappers**:
- `bd list` → `tasks list --bd-format` (shortId/blockedBy formatting).
- `bd claim` → `tasks claim` + bd-specific shortId echo.
- `bd children` → `tasks children` + bd path-folder walk via flag.
- `bd blocked` → `tasks --blocked --bd-format`.
- `bd update -s` → `tasks status` (delegate).
- Keep bd-specific behavior wrapped: create (id-form derivation), update (description/notes paragraph semantics), close/drop (close-fields/drop-fields data writes), rename (move-with-refs).
27. **Phase 5 — bd-only-keeps**:
- `bd ready`, `bd orphans`, `bd agent`, `bd info`, `bd where`, `bd query`, `bd rename`, `bd config`, `bd migrate`, `bd export`, `bd remember`, `bd memories`, `bd prime`.
- These are bd-and-workflow specific; document as "bead-tracking commands" in help.

## Follow-up beads to file (team-lead reviews and files)

- **km-beads.share-resolveTask**: factor `findNodeByPathOrId` + `resolveIssueArg` into `repo.resolveTask(arg, {bd?:true})`. P3.
- **km-beads.share-print-details**: shared `printTaskDetails(node, {bd?:true})` between `bd show` and `tasks <id>`. P3.
- **km-tasks.priority-filter**: `km tasks --priority P1` flag. P2.
- **km-tasks.assignee-filter**: `km tasks --assignee <name>` flag (first-class, separate from `@person` query). P3.
- **km-tasks.blocked-filter**: `km tasks --blocked` / `--unblocked` flags. P2.
- **km-tasks.limit-flag**: `km tasks --limit N`. P3.
- **km-tasks.dep-subcommands**: port `dep add/remove/list` from `km bd`. P2.
- **km-tasks.stale-subcommand**: `km tasks stale [--days N]`. P3.
- **km-tasks.children-subcommand**: `km tasks children <id>`. P2.
- **km-tasks.set-extend**: extend `set` to accept `type:`, `description:`, `notes:`. P3.
- **km-tasks.status-reason**: `km tasks status <id> done --reason "…"` (audit field). P3.
- **km-tasks.unify-claim-assignee**: use git-config-with-env-fallback in `tasks claim`. P3.
- **km-beads.bd-as-thin-wrapper**: rewrite `bd list / claim / children / blocked / update -s` to delegate to `km tasks`. P2 (after the above land).
- **km-beads.harmonize-json-shape**: shared task JSON shape with optional `bd:` extension. P4.
- **km-beads.unify-default-status-filter**: doc + align default `-status:done` filter between surfaces. P4.
- **km-beads.promote-mem**: consider promoting `bd remember/memories/prime` out of `km bd` to `km mem` (or `km`). P4.

## Verification of the audit

- `bun km bd --help` lists 24 commands (excluding `help`); audit row count matches.
- `bun km tasks --help` lists 5 subcommands + 6 flag-mode operations; covered above.
- Implementations read: `apps/km-cli/src/commands/bd.ts` (1015 lines), `apps/km-cli/src/commands/tasks/{index,list,mutations,set-clear,status,queries,formatters}.ts`.

