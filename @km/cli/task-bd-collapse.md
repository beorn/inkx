---
id: "@km/cli/task-bd-collapse"
aliases:
  - km-cli.task-bd-collapse
  - km-cli-task-bd-collapse
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:00:00Z
type: feature
priority: P1
status: todo
parent: km-cli
---

# [ ] Collapse `km bd` into `km task` + `km` generic verbs; bd becomes thin back-compat shim @km/cli #feature #P1

Unify the two near-identical task/bead CLI surfaces (`km tasks` 1368 LOC, `km bd` 3022 LOC) into one canonical task surface `km task` (workflow-only) + a fattened generic `km` (set, clear, move, children, stale, query). `km task` stays thin: just the verbs that need task-domain knowledge. `km bd` becomes thin wrappers delegating to `km task`/`km` for backwards compatibility. Drop ~3000 LOC of duplication; close the dependency-mutation gap; rationalize default scope and lifecycle verbs.

**Quality plateau target: L4 across the wave acceptance criteria** — make invalid state impossible by construction (closed subcommand set, no auto-detect ambiguity, pure planners testable without I/O chain, emitter not on public Repo surface), with property/fuzz tests pinning regressions per L5 where it pays.

Created from `/pro` 3-leg consultation (GPT-5.4 Pro + Claude Opus 4.6 + Gemini 3 Pro, judge winner Opus, $1.98 spend, 405s wallclock); refined after the "thin task / fat km" review and "rename → move" canonicalization.

## Problem

Two CLI surfaces do nearly the same thing:

- **`km tasks`** (1368 LOC, 8 files in `apps/km-cli/src/commands/tasks/`) — generic task verbs (list, set, claim, status, stale)
- **`km bd`** (3022 LOC, 10 files starting with `apps/km-cli/src/commands/bd*.ts`) — beads-compatible issue tracking (list, ready, show, create, update, close, drop, claim, dep, stale, orphans, query, rename, info, where, migrate)

Beads ARE tasks (`type: task` in frontmatter). Same data, two CLI views. The split is accidental — they grew in parallel; the data model already unified them.

Overlap: 9 of 11 bd verbs already exist in `tasks`. The two real gaps are `dep` (dependency mutation) and bead-frontmatter setters (type, parent, aliases, id).

## Goal

1. Rename `tasks` → `task` (singular — matches `gh issue`, `git branch`, `kubectl get pod`).
2. Make `km task` thin — only verbs that genuinely need task-domain knowledge (board view, ready/blocked/orphans, claim/release/close/drop/reopen, dep).
3. Push generic node-graph verbs to top-level `km` (set, clear, move, children, stale, query) — "tasks are nodes" mental model.
4. Add the two real gaps: bead-frontmatter via `km set` (also re-aliased as `task set`); `task dep add/rm/ls` (delegating to a generic `km link` infra layer underneath).
5. **Canonical verb is `move`, not `rename`.** Rename is a special-case of move (rewrites refs, possibly changes id). `km move <node> <parent-or-new-id>` covers both. `km rename` exists as an alias for muscle-memory.
6. `km bd` becomes a thin alias layer that delegates to `km task` / `km` (back-compat for muscle memory).
7. Drop residue: `bd info`/`bd where` → `km doctor`/`km config`; `bd migrate` → `km import bd`.

## Final command list (opinionated, after "thin task / fat km" review)

### `km` — generic node-graph verbs (extended)

```
# Existing (no change)
km list / ls [query]                   # list nodes with filters
km show <id>                           # node details
km new <content> [--type --parent --aliases --id --priority --owner --due --start]
km import <source>                     # km import bd <vault>, km import asana, ...

# New (added by this work)
km set <id...> field:value...          # generic field mutation (also: --flag form)
km clear <id...> field...              # generic field clear
km move <node> <target>                # CANONICAL: reparent OR rename — rewrites refs
km rename <id> <new-id>                # alias of `km move <id> <new-id>` (muscle memory)
km children <id>                       # alias of `km show <id> -c` (discoverability)
km stale [-d N]                        # untouched-≥N-days across any node
km query <dsl>                         # alias of `km list --raw <dsl>`

# Output flags (every list-shaped command)
  --json                               # JSON output
  --jq <expr>                          # filter JSON (implies --json)
  --all                                # include done/dropped
  -o short|wide|json                   # output format
```

`km move <a> <b>` resolves `<b>` polymorphically:
- If `<b>` is an existing node id → reparent
- If `<b>` is a new path-form id (no node exists) → rename + ref-rewrite
- If `<b>` is `--root` → move to root
Both shapes go through one ref-rewrite engine (`@km/storage/move-with-rewrite-refs`).

### `km task` — workflow-specific (thin)

```
# Views
km task                                # board view: open tasks, sorted by priority
km task <query>                        # board view, filtered
km task ready                          # todo + unblocked
km task blocked                        # blocked tasks
km task orphans                        # commit-referenced but still open
km task show <id>                      # alias of `km show <id>` for ergonomics

# Creation
km task new <title> [field:value...] [--type --parent --priority --owner --due --start --aliases --id -i -e]
  # task-shaped wrapper around `km new` with task defaults (type=task, etc.)
  # field:value and flags share one parser (derived from field schema)

# Mutation (alias for ergonomics — delegates to `km set`/`km clear`)
km task set <id...> field:value...     # alias: `km set` with task field-name validation
km task clear <id...> field...         # alias: `km clear`

# Lifecycle (workflow transitions — validation + side effects, NOT sugar over `set`)
km task claim <id>                     # → wip + owner=$USER (validates not-already-claimed-by-other)
km task release <id>                   # → clear owner
km task close <id> [--reason TEXT]     # → done + closedAt + optional reason + child-cascade hooks
km task drop <id> [--reason TEXT]      # → dropped + closedAt + optional reason
km task reopen <id>                    # → todo (from done/dropped); validates source state

# Graph (task-domain semantic on top of generic km link infra)
km task dep add <id> <blocker...>      # add blocked-by edge (delegates to km link --rel blocks)
km task dep rm <id> <blocker...>       # remove
km task dep ls <id>                    # list both directions
```

### Verbs that are NOT under `km task`

`stale`, `query`, `children`, `move`, `rename` are NOT re-aliased on `km task`. The "tasks are nodes" mental model is reinforced by forcing the user up to `km` for these. Aliasing every generic verb on `task` adds help-screen surface for no real ergonomic win.

Three exceptions are aliased for daily-driver ergonomics: `task show` → `km show`, `task set` → `km set`, `task new` → `km new` (task-defaulted). Everything else is `km <verb>`.

## Tension resolutions (from /pro consensus)

| # | Tension | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | Singular vs plural | **Singular `task`** (alias `tasks` for muscle memory, undocumented) | Resource-type names are singular across modern CLIs (gh, docker, kubectl, cargo, git). `km task claim 42` reads as "task: claim 42"; `km tasks claim 42` reads as imperative-to-collection. |
| 2 | Bare verb behavior | **List (board view)** | The most common operation is "what should I work on?" — make it zero-friction. Subcommand set is closed; anything else is a query. |
| 3 | Show location | **Both — `km task show <id>` AND `km show <id>`, one renderer** | `km show` for power users; `km task show` for discoverability via `task --help`. Alias not maintenance burden. |
| 4 | Mutation syntax | **field:value primary, flags accepted; same parser** | field:value is compact and multi-value-friendly (taskwarrior). Flags are discoverable via `--help` and shell-completion-friendly (gh). Derive flags from field schema; one source of truth. |
| 5 | Lifecycle shortcuts | **Keep — they're workflow transitions, not sugar** | `close` validates preconditions, sets `closedAt`, records reason, may trigger hooks/cascade. `set status:done` is a raw field write. Different operations. Document this distinction explicitly. |
| 6 | Default scope | **Board view (hide done/dropped, sort by priority)** with `--all` escape, `query` for raw | "What's on my plate?" is the question 95% of invocations are asking. |
| 7 | Preset views | **Subcommands (ready/blocked/stale/orphans)** — small, named, evolvable | Memorable, completable, can grow flags (`stale -d 14`). Better than arbitrary preset config for a personal tool. |
| 8 | Dep surface | **`task dep` user-facing; `km link` infra underneath, exposed later** | Users think "blockers" not "graph edges". Build the generic system; expose the domain verb. Exposing `km link` waits for a second consumer. |
| 9 | ID vs query parsing | **No auto-detect. Bare positional = query filter. Explicit verb (`show`) = id.** | Auto-detect breaks. Subcommand set is closed; everything else is a query string. If list result is exactly one item, append a "Tip: use `km task show <id>` for full detail" hint that suppresses after a few uses. |
| 10 | Generic vs task-domain split | **Thin `task` (workflow only); fat `km` (generic node verbs)**. Re-alias `show`/`set`/`new` for daily ergonomics; everything else is `km <verb>` only. | "Tasks are nodes" mental model. Aliasing every generic verb under `task` doubles help-screen surface with no ergonomic win. |
| 11 | Rename vs move | **`move` is canonical**. `rename` is an alias. `km move <node> <target>` polymorphically dispatches: existing node → reparent; new id → rename + ref-rewrite. | One ref-rewrite engine (`@km/storage/move-with-rewrite-refs`), one verb. Avoids two near-identical mutation paths. Rename keeps muscle memory. |

## What gets cut from the current `tasks` surface

| Cut | Why |
|-----|-----|
| `km tasks --new`, `--done`, `--claim`, `--release`, `--assign` (top-level flag forms) | Top-level flags that behave like subcommands violate POSIX conventions and create parser nightmares. Use subcommands only. |
| `km tasks status <id> [new]` as primary mutation | Redundant. `set <id> status:X` covers raw field write; lifecycle verbs cover workflow transitions. Keep as a thin alias for back-compat, but document the two primary paths. |
| `km tasks list` as explicit subcommand | Bare `km task` is the list. (Like `git branch` not `git branch list`.) |

## What gets added

| Added | Why |
|-------|-----|
| `task reopen <id>` | Real workflow gap: going from done/dropped back to todo. Without it, users reach for `set status:todo` and skip validation. |
| `--json` + `--jq` on every list command | Scripting, piping, TUI feeding, dashboards. Non-negotiable for a tool in a unix ecosystem. |
| `field:value` syntax on `new` (parser shared with `set`) | `km task new "Fix auth" priority:P0 due:friday` is faster than five flags. |
| `task dep add/rm/ls` | Closes the real gap — neither `tasks` nor stock km has dependency mutation today. |
| Bulk by multiple ids OR `--where "<query>"` | Real-world muscle: "close all P3s in the foo subtree", "claim all blocked tasks". |
| `task edit <id>` | Open in editor with prefilled frontmatter. |
| Working-directory scoping | If cwd is under `vault/@km/storage/`, default scope is `@km/storage/*`. `--global` overrides. (git-style cwd detection.) |

## `km bd` alias mapping

```typescript
const BD_ALIASES: Record<string, string[]> = {
  // Task-domain verbs → task subcommand
  ready:    ["task", "ready"],
  list:     ["task"],
  show:     ["task", "show"],
  create:   ["task", "new"],
  update:   ["task", "set"],
  close:    ["task", "close"],
  drop:     ["task", "drop"],
  claim:    ["task", "claim"],
  dep:      ["task", "dep"],
  orphans:  ["task", "orphans"],
  blocked:  ["task", "blocked"],

  // Generic verbs → top-level km
  stale:    ["stale"],            // km stale (any node, not just tasks)
  children: ["show", "-c"],       // km show <id> -c
  query:    ["list", "--raw"],    // km list --raw <dsl>
  rename:   ["move"],             // km move (canonical; `rename` exists as km alias)
}

// Dropped from bd (no alias):
//   info    → km doctor
//   where   → km config bd.*
//   migrate → km import bd
```

Print a once-per-session deprecation notice on first `bd` use: `bd is an alias for km task. This shim will be removed in v2.`

## Ergonomic tricks (the delight layer)

1. **Short id resolution** (the single biggest ergonomic win). Resolution order: slug → scope/slug → full path. `km task show foo` resolves to `@km/storage/foo` if unambiguous; on ambiguity, error with candidates. This is taskwarrior-style typing economy without sacrificing canonical paths.
2. **Smart hints on near-miss**. If a list arg looks like a single id, append "Tip: use `km task show <id>` for full detail." If `set` gets a typo'd field key, print close matches. If `close`/`drop` lack a reason, suggest `--reason`.
3. **Natural-language dates** via chrono-node: `tmrw`, `next mon`, `+2w`, `friday`, `eod`, `eow`, `eom`. Shown as relative ("in 3 days") in lists; absolute in `show`.
4. **Bulk operations** on every single-item verb. Multiple ids OR `--where "<query>"`. Always `--dry-run` available.
5. **Output modes**: `-o short` (default board), `wide` (add due/start/owner), `json` (script-friendly). Color and icons for status/priority. Overdue items red. Blocked items show blocker inline.
6. **Context shortcuts**: `--mine` filter, `owner:@me` query token, `task claim` with no id → interactive picker over `ready` list (Clack pattern).
7. **Editor integration**: `task new -e` and `task edit <id>` open in `$EDITOR` with prefilled frontmatter; on save, auto-index and validate.
8. **Status bar in list output**: `@km — 12 open (3 wip · 2 blocked · 7 todo) — 4 closed this week` as a header line above the table.
9. **Shell completion (generated, context-aware)**: `km completion {bash,zsh,fish}`. After `task` → subcommands + ids. After `set <id>` → field names with `:` suffix. After `set <id> status:` → enum values. After `dep add <id>` → open task ids.
10. **Dry-run for destructive ops** (`rename`, `move`, bulk `set`/`close`): show diff preview with ref-rewrite counts before applying. Required, not optional.
11. **Working-directory scoping** (git-style): `cd ~/vault/@km/storage` then bare `km task` is implicitly scoped to the storage subtree. `--global` overrides.
12. **Default-command config**: `defaultCommand: task` in `.km/config.yaml` lets bare `km` invoke `km task`. One keystroke board view.

## Wave breakdown (each wave aims for L4 plateau on its acceptance criteria)

### Wave 1 — additive to existing `tasks` (SHIPPED in this session)

- ✅ `tasks set <id> field:value` learned `type`, `parent`, `aliases` fields (commit `5879b20cf`)
- ✅ `tasks --new` learned `--type`, `--id`, `--aliases`, `--parent`, `--owner` flags (commits `78762a3c1` + `fafae54ce`)
- ✅ `tasks ready` subcommand exists (commit `91352d6ab`)
- ✅ Pure-planner extraction pattern established (`set-clear-plan.ts`, `mutations-plan.ts`) — tests immune to silvery import-chain failure
- ⏸ `sync.ts:149 repo.emitter` drift — agent stopped at scope boundary; promoted to standalone Wave 1.5

**L4 evidence:** new test files import pure planners directly, do not transitively pull `program.ts` → `@silvery/ag-react/ui/*`. Tests pass even while silvery WIP is mid-flight in vendor.

### Wave 1.5 — emitter off public Repo surface (in flight)

- Move `emitter` from `SyncableRepo`/`Repo` readonly field to `SyncConfig` argument (or close over in `withSync`/`withFsWriter` constructor)
- Acceptance: zero `repo.emitter` reads in `packages/{km-storage,km-fs-mount}/src/`, `apps/{km-tui,km-cli}/src/`
- Property test: pin "emitter not on Repo public surface" so the closed-bead invariant holds going forward
- Supersedes / closes `@km/storage/sync-legacy-cleanup` (the original close-claim was wrong — emitter was still public)

**L4 evidence:** access to the deprecated field becomes a TS error at compile time; can't drift back.

### Wave 2 — pure-planner extraction propagation (in flight)

- Extend planner pattern from `set-clear`/`mutations` to `list`, `status`, `stale`, plus pin `queries`/`formatters` as already-pure
- New unit-test files for each planner; total 16+ new tests
- Acceptance: every `*-plan.ts` file has zero imports from `@silvery/{commander,ag-react}`, `program.ts`, `load-repo`, `createTerm`. Verified by grep gate in CI.

**L4 evidence:** pure modules can be tested without booting commander or silvery. Infrastructure-fragility-induced test failures become impossible by construction in this layer.

### Wave 3 — flag rename + lifecycle hardening

- ✅ `tasks -i, --id` (boolean) → `-i, --show-ids`; `--task-id` → `--id` (in flight via flag-rename agent)
- Rename `tasks` → `task` (singular), keep `tasks` as undocumented alias
- Drop top-level mutation flags (`--new`, `--done`, `--claim`, `--release`, `--assign`) — POSIX-violating, parser-confusing
- Add `task reopen <id>`
- Convert lifecycle verbs (`close`, `drop`, `claim`, `release`, `reopen`) into proper workflow transitions: validation, `closedAt`, optional reason, hook surface
- Add `task close --reason TEXT`, `task drop --reason TEXT`
- **L4/L5 acceptance**: lifecycle transitions are atomic + invariant-preserving (tested with property/fuzz: random sequences of claim/release/close/drop never leave inconsistent state). `set status:done` and `close <id>` are documented as different operations; tests pin the difference (close has `closedAt`; set does not).

### Wave 4 — generic km verbs (the "fat km" extension)

- Add `km set <id...> field:value...` and `km clear <id...> field...` (generic mutation; `task set`/`task clear` become aliases that add task-field validation)
- Add `km move <node> <target>` polymorphic dispatch: existing-id → reparent; new-id → rename + ref-rewrite. Wait for `@km/storage/move-with-rewrite-refs` to land. Add `km rename` as alias of `km move`.
- Add `km stale [-d N]` for any node (tasks-only is `km task stale` if needed)
- Add `km children <id>` (alias for `km show <id> -c`)
- Add `km query <dsl>` (alias for `km list --raw`)
- Add `--json` + `--jq` to every list-shaped command in stock km
- **L4 acceptance**: `km move` has one ref-rewrite engine for both reparent and rename; bd's old `bd rename` and `move` paths cannot diverge by construction. Property test: ref-rewrite count + content-hash invariants hold across random move sequences.

### Wave 5 — graph + bulk

- Add `task dep add/rm/ls` (filling the real gap; delegates to `km link --rel blocks` infra)
- Build the generic `km link` infra (internal API; not yet user-exposed at top-level)
- Add bulk-by-multiple-ids OR `--where "<query>"` to mutations + lifecycle verbs
- **L4 acceptance**: `task dep` and `km link --rel blocks` go through the same writer; bulk operations preserve atomicity (all-or-nothing per id, with dry-run preview).

### Wave 6 — bd → task/km alias layer

- `bd <subcmd> args` argv-translates to `km task <translated> args` OR `km <translated> args` (per the alias table above)
- Preserve bd defaults (hide done, sort by priority, scope to issue-prefix subtree) as `--board` / `--issue-prefix-scope` flags on `task`
- Once-per-session deprecation notice on first `bd` use
- Drop `bd info`/`bd where`/`bd migrate` from alias map; redirect to `km doctor`/`km config`/`km import bd`
- `apps/km-cli/src/commands/bd*.ts` shrinks to ≤500 LOC, mostly argv translation
- **L5 acceptance**: zero duplicated logic between `bd` and `task`/`km`; legacy bd code paths deleted (not just deprecated). Property test: every bd command has identical effect to its task/km equivalent on a corpus of 100 random invocations.

### Wave 7 — delight

- Short-id resolution (slug → scope/slug → full path), with ambiguity error showing candidates
- Natural-language dates via chrono-node
- Shell completion (bash/zsh/fish generated, context-aware: subcommands, ids, field names, enum values)
- Status-bar header in list output (counts: open / wip / blocked / closed-this-week)
- Working-directory scoping (git-style: `cd vault/@km/storage` → bare `km task` scopes there)
- Editor integration (`task edit`, `task new -e`)
- Smart hints on near-miss (typo'd field, looks-like-id, missing reason)
- Dry-run for destructive ops (`move`, `rename`, bulk `set`/`close`)
- **L4 acceptance**: every destructive op (`move`, bulk operations) supports `--dry-run` with diff preview. CI gate: a destructive op without `--dry-run` support is a build failure.

## Acceptance criteria (L4 plateau target across the board)

### Surface

- [ ] `km task` is the canonical task-workflow surface; `km tasks` works as undocumented alias
- [ ] `km bd` works as a thin alias layer translating argv to `km task` / `km <verb>` (no duplicated logic)
- [ ] All 11 bd verbs map to either `task` or `km` per the alias table
- [ ] `apps/km-cli/src/commands/bd*.ts` is ≤500 LOC, argv-translation only (L5: legacy logic deleted, not deprecated)

### Generic km verbs

- [ ] `km set <id...> field:value...` and `km clear <id...> field...` exist
- [ ] `km move <node> <target>` polymorphic: existing-id → reparent; new-id → rename+ref-rewrite. One engine.
- [ ] `km rename <id> <new-id>` exists as alias of `km move`
- [ ] `km stale [-d N]`, `km children <id>`, `km query <dsl>` exist
- [ ] All list-shaped km commands accept `--json`, `--jq`, `--all`, `-o`

### Task-domain verbs

- [ ] `task dep add/rm/ls` creates/queries `blocks`/`blocked-by` link rows via shared `km link --rel blocks` infra
- [ ] `task new` accepts `--type`, `--id`, `--aliases`, `--parent` flags
- [ ] `task set <id> field:value...` accepts `type`, `parent`, `aliases`, `id` fields (delegates to `km set` with task-field validation)
- [ ] `task close`/`drop`/`claim`/`release`/`reopen` are workflow transitions with validation + side effects (`closedAt`, optional `--reason`, hook surface, child-cascade) — NOT raw `set status:X`. Distinction documented + tested.
- [ ] Short-id resolution: `task show foo` resolves to `@km/scope/foo` if unambiguous; errors with candidates otherwise

### L4 invariants (impossible-by-construction)

- [ ] **Pure planners** for every command: zero imports of `@silvery/{commander,ag-react}`/`program.ts`/`load-repo`/`createTerm` in any `*-plan.ts` file. CI gate enforces.
- [ ] **`repo.emitter` not on public Repo surface**: zero hits of `repo\.emitter` in `packages/{km-storage,km-fs-mount}/src/`, `apps/{km-tui,km-cli}/src/`. CI gate enforces.
- [ ] **One ref-rewrite engine** for `km move` reparent and `km move` rename — they share the same code path; can't drift. Property test: random move/rename sequences preserve ref integrity.
- [ ] **Closed subcommand set on `km task`**: bare positional that isn't a subcommand → unambiguously a query. No auto-detect heuristic.
- [ ] **Lifecycle vs set semantic distinction tested**: `close <id>` always sets `closedAt`; `set status:done` never does. Property test holds over random sequences.

### L5 invariants (regression-pinned)

- [ ] **Property test for bd⇔task equivalence**: random invocations of bd commands produce identical state to their task/km equivalents on a 100+ corpus.
- [ ] **Property test for lifecycle atomicity**: random sequences of claim/release/close/drop/reopen never leave inconsistent state (e.g., claimed but not assigned, closed without closedAt).
- [ ] **Legacy code deleted, not deprecated**: bd's duplicated planning code is removed (not commented out). Old field-mutation paths in `tasks status` for non-status fields are removed (the documentation-side argument moves to `set`).

### Documentation

- [ ] `docs/ref/cli.md` (or equivalent) reflects the unified surface
- [ ] `apps/km-cli/CLAUDE.md` documents the lifecycle vs set distinction and the thin-task / fat-km split
- [ ] `bd` prints once-per-session deprecation notice on first use, with the equivalent `km` invocation

## Out of scope

- Universal `km link` exposure — wait for second consumer
- Custom user-defined presets (config-shaped) — start with the four named views (`ready`, `blocked`, `stale`, `orphans`)
- Multi-vault scoping
- Subscription/notification hooks beyond the close/drop transition

## /pro consultation summary

3-leg dispatch (GPT-5.4 Pro + Kimi K2.6 + Claude Opus 4.6 + Gemini 3 Pro, Kimi failed). Pairwise judge: Opus (20) > GPT-5.4 (18) > Gemini (16). $1.98, 405s wallclock.

Strong consensus across the three working models on every tension except #3 (show) and #9 (id-vs-query):

- Show: Opus + GPT keep both `task show` and `km show`; Gemini drops `task show` to force the "tasks are nodes" mental model.
- ID-vs-query: Opus + GPT explicit-verbs-only; Gemini auto-detect via sigil prefix.

Resolved both in favor of Opus + GPT (more conservative, less surprise, eliminates parser-bug class).

Full /pro output: `/var/folders/x6/0j792q0d0411wgsxyr1bqkp40000gn/T/llm-f9eb64dc-critique-the-proposed-km-unx7.txt` (38KB; preserved for design history).

## References

- Current `tasks` surface: `apps/km-cli/src/commands/tasks/index.ts`
- Current `bd` surface: `apps/km-cli/src/commands/bd.ts`
- bd-fixer recent fix (path-form id resolution): `1cd5dc96c fix(km-beads): derive bead shortId from fs_path when data.id absent`
- Related in-flight: `@km/storage/move-with-rewrite-refs` (delivers ref-rewrite for rename/move)
- Related closed: `@km/beads/data-id-stop-writing` (no more `data.id` in frontmatter — file path is canonical)
