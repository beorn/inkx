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

# [ ] Collapse `km bd` into `km task`; bd becomes thin back-compat shim @km/cli #feature #P1

Unify the two near-identical task/bead CLI surfaces (`km tasks` 1368 LOC, `km bd` 3022 LOC) into one canonical surface `km task`. Make `km bd` thin wrappers that delegate to `km task` for backwards compatibility. Drop ~3000 LOC of duplication; close the dependency-mutation gap; rationalize default scope and lifecycle verbs.

Created from `/pro` 3-leg consultation (GPT-5.4 Pro + Claude Opus 4.6 + Gemini 3 Pro, judge winner Opus, $1.98 spend, 405s wallclock).

## Problem

Two CLI surfaces do nearly the same thing:

- **`km tasks`** (1368 LOC, 8 files in `apps/km-cli/src/commands/tasks/`) — generic task verbs (list, set, claim, status, stale)
- **`km bd`** (3022 LOC, 10 files starting with `apps/km-cli/src/commands/bd*.ts`) — beads-compatible issue tracking (list, ready, show, create, update, close, drop, claim, dep, stale, orphans, query, rename, info, where, migrate)

Beads ARE tasks (`type: task` in frontmatter). Same data, two CLI views. The split is accidental — they grew in parallel; the data model already unified them.

Overlap: 9 of 11 bd verbs already exist in `tasks`. The two real gaps are `dep` (dependency mutation) and bead-frontmatter setters (type, parent, aliases, id).

## Goal

1. Rename `tasks` → `task` (singular — matches `gh issue`, `git branch`, `kubectl get pod`).
2. Make `task` the canonical mutation + view surface for tasks/beads.
3. Add the two real gaps: bead-frontmatter as `task set` fields; `task dep add/rm/ls`.
4. `km bd` becomes a thin alias layer that delegates to `km task` (back-compat for muscle memory).
5. Drop residue: `bd info`/`bd where` → `km doctor`/`km config`; `bd migrate` → `km import bd`.

## Final command list (opinionated, distilled from /pro)

```
# ─── Views ──────────────────────────────────────────────────────
km task                                # board view: open tasks, sorted by priority
km task <query>                        # board view, filtered by query string
km task ready                          # todo + unblocked
km task blocked                        # blocked tasks
km task stale [-d N]                   # untouched ≥N days (default 7)
km task orphans                        # commit-referenced but still open
km task children <id>                  # children of a parent/epic
km task show <id>                      # full detail (deps, history, body)
km task query <dsl>                    # raw DSL, no default scoping/sorting

# ─── Creation ───────────────────────────────────────────────────
km task new <title> [field:value...] [flags]
  # Flags: --type, --id, --parent, --priority, --owner,
  #        --due, --start, --alias (repeatable), -i interactive, -e editor

# ─── Mutation ───────────────────────────────────────────────────
km task set <id...> field:value...     # set fields (also accepts --flag form)
km task clear <id...> field...         # clear fields
# Bulk: accepts multiple ids OR --where "<query>"

# ─── Lifecycle (workflow transitions, not sugar) ────────────────
km task claim <id>                     # → wip + owner=$USER
km task release <id>                   # → clear owner
km task close <id> [--reason TEXT]     # → done + closedAt + optional reason
km task drop <id> [--reason TEXT]      # → dropped + closedAt + optional reason
km task reopen <id>                    # → todo (from done/dropped)

# ─── Graph ──────────────────────────────────────────────────────
km task dep add <id> <blocker...>      # add dependency
km task dep rm <id> <blocker...>       # remove dependency
km task dep ls <id>                    # list both directions (blocks / blocked-by)
km task rename <id> <new-id>           # rename + rewrite all references
km task move <id> <parent>             # reparent

# ─── Output (every list command) ────────────────────────────────
  --json                               # JSON output
  --jq <expr>                          # filter JSON (implies --json)
  --all                                # include done/dropped
  -o short|wide|json                   # output format (kubectl-style)
```

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
  ready:    ["task", "ready"],
  list:     ["task"],
  show:     ["task", "show"],
  create:   ["task", "new"],
  update:   ["task", "set"],
  close:    ["task", "close"],
  drop:     ["task", "drop"],
  claim:    ["task", "claim"],
  dep:      ["task", "dep"],     // pass through sub-verb + args
  stale:    ["task", "stale"],
  orphans:  ["task", "orphans"],
  children: ["task", "children"],
  blocked:  ["task", "blocked"],
  query:    ["task", "query"],
  rename:   ["task", "rename"],
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

## Wave breakdown

### Wave 1 — additive to existing `tasks` (in flight via tasks-unification agent, session f9eb64dc)

- Add bead-frontmatter fields to `tasks set`: `type`, `parent`, `aliases`, `id`
- Add bead-frontmatter flags to `tasks --new`: `--type`, `--id`, `--aliases`, `--parent`
- Add `tasks ready` subcommand
- Drift fix: `packages/km-fs-mount/src/watch/sync.ts:149` `repo.emitter` reference

### Wave 2 — rename + lifecycle hardening

- Rename `tasks` → `task` (singular), keep `tasks` as undocumented alias
- Drop top-level mutation flags (`--new`, `--done`, `--claim`, `--release`, `--assign`)
- Add `task reopen <id>`
- Convert lifecycle verbs (`close`, `drop`, `claim`) into proper workflow transitions: validation, `closedAt`, optional reason, hook surface
- Add `task close --reason TEXT`, `task drop --reason TEXT`

### Wave 3 — graph + power features

- Add `task dep add/rm/ls` (filling the real gap)
- Build `km link` infra underneath; `task dep` delegates
- Wait for `@km/storage/move-with-rewrite-refs` (in progress); then `task rename` and `task move` delegate to that
- Add `--json` and `--jq` to every list command
- Add bulk-by-multiple-ids and `--where` to mutations

### Wave 4 — bd → task alias layer

- `bd <subcmd> args` argv-translates to `km task <translated> args`, preserving bd defaults (hide done, sort by priority, scope to issue-prefix subtree — these become flags on `task`, not bd-only)
- Once-per-session deprecation notice
- Drop `bd info`/`bd where`/`bd migrate` from the alias map; redirect to `km doctor`/`km config`/`km import bd`

### Wave 5 — delight (the ergonomic tricks above)

- Short-id resolution (slug → scope/slug → full path)
- Natural-language dates via chrono-node
- Shell completion (bash/zsh/fish generated)
- Status-bar header in list output
- Working-directory scoping
- Editor integration (`task edit`, `task new -e`)
- Smart hints on near-miss
- Dry-run for destructive ops

## Acceptance criteria

- [ ] `km task` is the canonical surface; `km tasks` works as undocumented alias
- [ ] `km bd` works as a thin alias layer that translates argv to `km task` (no duplicated logic)
- [ ] All 11 bd verbs have a `task` equivalent, with bd's defaults preserved (as flags on `task`)
- [ ] `task dep add/rm/ls` exists and creates/queries `blocks`/`blocked-by` link rows
- [ ] `task set <id> field:value...` accepts `type`, `parent`, `aliases`, `id` fields
- [ ] `task new` accepts `--type`, `--id`, `--aliases`, `--parent` flags
- [ ] All list commands accept `--json`, `--jq`, `--all`, `-o`
- [ ] `task close`/`drop`/`claim`/`release`/`reopen` are workflow transitions with validation, not raw field writes (each runs `set status:X` plus the workflow side effects: `closedAt`, optional `--reason`, hook surface)
- [ ] Short-id resolution: `task show foo` resolves to a unique `@km/scope/foo` or errors with candidates
- [ ] `bd` prints once-per-session deprecation notice on first use
- [ ] `apps/km-cli/src/commands/bd*.ts` is thin (≤500 LOC, mostly argv translation)
- [ ] All existing tests still pass; new tests cover dep mutations and bead-frontmatter field setters
- [ ] Documentation in `docs/ref/cli.md` (or wherever) reflects the unified surface

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
