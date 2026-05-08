---
description: "Beads — issue tracking with km bd. Canonical surface for the bead workflow: CLI, lifecycle, ids, claim/release, storage model. Load this for anything bead-related. /pm aliases here."
argument-hint: "[create | claim | close | list | show | ready | <bead-id>]"
allowed-tools: Bash, Read, Edit
benefits-from: [worktree, commit]
---

# Beads — issue tracking workflow

**Keywords**: bead, beads, km bd, issue, ticket, claim, close, ready, in_progress, P0, P1, P2, P3, P4, scope epic, sub-bead, parent, label

The single source of truth for bead operations. `/pm` is a thin alias that routes here for bead workflow; the deeper docs in `.claude/skills/pm/` are referenced for specific recipes (creation forms, label hygiene, retrospectives).

## Storage model — markdown files in the vault

Bead state is **per-vault markdown** under the path-form id (`@km/<scope>/<slug>`), with bd-form (`km-<scope>.<slug>`) as a legacy alias. Beads ride the normal git transport — there is no separate `.beads/` directory or Dolt push. `km bd` reads/writes the markdown files plus the local index in `.km/state.db` (gitignored cache).

The filesystem path is the canonical identity. Do **not** add `id:` frontmatter when the path already carries the id. Use `aliases:` only for legacy bd/dash forms or old names.

### Frontmatter minimalism (load-bearing — agents over-add)

The default for a new bead is **no frontmatter at all** — the H1 line carries the title, type, and priority via hashtags (`#feature #P2`); the path-form id is canonical; bd auto-generates `aliases:` and `created_at:` when needed. Add frontmatter fields only when they're load-bearing for tooling or migration:

| Field | When to add | When NOT to add |
|---|---|---|
| `id:` | never (path is canonical) | always — redundant with the file path |
| `aliases:` | migration from bd-form / dash-form / renamed beads | new beads with no legacy ids |
| `parent:` | when path doesn't encode parent | path-form ids encode parent — leave it off |
| `mentions:` | bd auto-generates; don't hand-author | hand-authored values get overwritten |
| `created_at:` | bd auto-stamps; don't hand-author | hand-authored values get overwritten |
| `agent:` | runtime hint for `km agent spawn` (codex/claude/silvercode) | not a workflow signal — leave it off unless spawning |
| `scope_fit:` | ❌ retired 2026-05-08 (slot redirect) | always — ad-hoc claim brings its own scope |
| `model:` / `harness:` | ❌ retired 2026-05-08 (slot redirect) | always — overspecified for queue-only slots |

**Trap**: copy-pasting frontmatter from a sibling bead drags in fields that don't apply. Start from the minimum and add only what the tooling specifically reads.

### Queue-only slot beads (`@agent/0..9.md`)

`@agent/N.md` slot beads are **queue-only**: H1 rule (`# @agent/N km.add:: . km.default:: true`, with `[/]` checkbox if wip) plus `![[<bead>]]` queue embeds. No `## Persona`, no `## Working agreement`, no `scope_fit:`, no frontmatter, no system-prompt/persona prose. The claiming agent brings its own working context; the slot is a parking spot for beads.

Plain organizational H2 groupings around the embeds are fine when the slot owner deliberately curated phases (e.g. `## 04 Chat Thread Projection`) — those help readability without reintroducing persona-as-contract.

This is a deliberate departure from the older "slot = pre-defined persona" model retired 2026-05-08. See `@km/agent/slot-files-minimal-form` for the cleanup contract and `.claude/skills/claim/SKILL.md` for the (queue-only) claim flow.

### Sibling file + sibling directory for parents with children

Use the sibling file + sibling directory layout for beads that have children: the `.md` file is the bead body, and the same-stem directory holds child beads. Example: `@km/silvercode/parity-claude.md` is the parent bead body, and child beads live under `@km/silvercode/parity-claude/`. Do not move the parent body inside the child directory as `@km/silvercode/parity-claude/parity-claude.md`.

| Surface | What's there |
|---|---|
| `@km/<scope>/<slug>.md` | Bead body. Frontmatter may have `aliases`, status fields, etc.; no redundant `id:`. |
| `@km/<scope>/<slug>/` | Child-bead directory for `@km/<scope>/<slug>.md`. |
| `.km/state.db` | Local FTS5 index + events table (gitignored, rebuilt from markdown on `km doctor rebuild`) |

**Sync**: `git add @km/<scope>/<slug>.md @km/<scope>/<slug>/ && git commit && git push` — that's it. Don't ever run `bd dolt push` (the Go bd binary and Dolt backend were retired 2026-04-29; `bd` is no longer on PATH).

## CLI surface

```bash
km bd create "<title>" --type <bug|feature|epic|task|docs> --priority <P0..P4> --id <slug>
km bd update <id> --claim                          # claim (status=wip + assignee=you)
km bd update <id> --status <status> --priority <p> --assignee <user> --parent <id>
km bd show <id>                                    # full details
km bd list [--status open|wip|done] [--priority P0] [--assignee me] [--limit N]
km bd ready [--priority P0] [--limit N]            # available unblocked work
km bd close <id> --reason "shipped <SHA> — what changed"
km bd children <id>
km bd info                                          # vault stats
km bd config get|set [<key>] [<value>]              # beads.prefix, etc.
km bd doctor                                        # consistency checks
km bd remember "<insight>"                         # memories (mem/<key>.md)
km import bd <vault>                                # import bd issues into a km vault
km import bd --export <vault>                       # dump km issues to .beads/issues.jsonl
```

**Resolution**: `km bd show` accepts path-form (`@km/silvercode/queue-stuck`), bd-form (`km-silvercode.queue-stuck`), and short id (`km-q5hji`). Same for `--parent`.

**The `--id` rule** (4734b3bb1): `--id` is the full identity. Prefer path-form ids for scoped beads, e.g. `--id @km/silvery/better-scroll-defaults`. Do not use `--parent km-silvery --id better-scroll-defaults` for new scoped beads. `--id wt.1` is literal "wt.1", no auto-scope-derive.

## Lifecycle

```
   create        claim          close
   ─────         ─────          ─────
  ┌─────┐      ┌─────┐        ┌──────┐
  │open │ ───→ │ wip │ ─────→ │ done │
  └─────┘      └─────┘        └──────┘
                  │
                  ↓ (rare: blocked dep)
              ┌─────────┐
              │ blocked │
              └─────────┘

   abandoned: km bd close <id> --reason "won't fix" → status=dropped
```

States: `open` (todo), `wip` (in_progress), `blocked`, `done`, `dropped`.

## Standing rule — bead ops on main repo's main worktree

**ALL bead operations happen on the main repo's main worktree, EXCEPT slot-bead self-close.**

Reason: bead state is per-worktree markdown files. From-main avoids the commit-push-pull propagation dance — when you `km bd update km-foo --claim` from `.claude/worktrees/wt3`, the change lands in wt3's working tree only, won't appear in main until pushed-merged-pulled.

The exception: releasing the slot lease `km bd update @agent/N --assignee "" --status open` IS run from inside `.claude/worktrees/wtN` because the slot's own lifecycle is local. (Persona slot AND worktree share one lease bead — one agent = one worktree.)

```bash
# Right
cd "$(git rev-parse --show-toplevel)"   # ensures main repo
km bd update km-foo --claim
# ... edits in main or in a slot ...
km bd close km-foo --reason "..."

# Wrong
cd .claude/worktrees/wt3
km bd update km-foo --claim       # lands in wt3 only
git push                          # everyone else's bead view is stale until they pull
```

## Naming convention

| Form | Example |
|---|---|
| Scope epic | `@km/<scope>` (path-form) / `km-<scope>` (bd-form) — e.g. `@km/silvercode` / `km-silvercode` |
| Sub-bead | `@km/<scope>/<slug>` / `km-<scope>.<slug>` — e.g. `@km/beads/cutover` / `km-beads.cutover` |
| Auto-id (no `--id`) | `km-<5-char-hash>` — e.g. `km-q5hji` (used when scope/name not pre-decided) |
| Slot bead | `@agent/1`..`@agent/9` (single lease for persona AND worktree — one agent = one worktree) |

Scope epics are permanent backlogs (per-package); they don't close. Project epics close when shipped.

If a sub-bead grows children, keep the parent body at `@km/<scope>/<slug>.md` and put children under `@km/<scope>/<slug>/`. This sibling directory is intentional; it is how bead trees are materialized.

## Common workflows

### Start a new bug fix
```bash
km bd ready --priority P0 --limit 5     # see what's free
km bd update <id> --claim               # claim before coding
# ... write a failing test, then fix, then verify ...
km bd close <id> --reason "shipped <SHA> — what changed, links to test"
```

### Create a new bead under a scope
```bash
km bd create "Fix the foo bug" --type bug --priority P1 --id @km/silvercode/fix-foo-bug
# Lands as @km/silvercode/fix-foo-bug
```

### Add notes mid-flight
```bash
km bd update <id> --notes "Discovered the root cause is X — see <file>:<line>"
```

### Triage stale wip
```bash
km bd list --status wip --assignee me        # what I claimed
km bd list --status wip                       # what anyone has wip
# For abandoned: km bd update <id> --release (clears assignee, back to open)
```

## Closure protocol — evidence in the reason

A close without evidence is a lie. The `--reason` text must include:

- **What shipped**: SHA(s) on origin/main
- **What test covers it**: path + count (e.g. `apps/km-cli/tests/foo.test.ts (5 tests pass)`)
- **For bugs**: a one-line "before/after" — what was broken, what's correct now

Example: `shipped: cfe7642fb (count-and-warn) — apps/km-cli/tests/doctor-rebuild-completeness.test.ts: 5/5 pass; doctor rebuild now reports skipped+failed counts and exits non-zero on any failure.`

## Numeric criteria — measure, don't estimate

If a bead description has numeric targets (≤12 useEffects, ≤1000 LOC, 0 TS errors): **run the grep/wc/tsc and paste the actual count** into the close reason. "Mostly done" is not done. The session that closed `@km/tui/tree/v4 Phase 9` claiming "21 useEffects → still 21" is the canonical anti-pattern.

## Pairs with

- `/worktree` — slot beads `@agent/1`..`@agent/9` are the pool's locks (one agent = one worktree)
- `/commit` — git transport for bead markdown files
- `/complete` — completeness audit verifies bead-acceptance grep against origin/main
- `/pm` — alias and deeper recipe docs (`.claude/skills/pm/{create,verify,beads-ids,labels,workflows}.md`)

## Anti-patterns

- Running `bd dolt push` — Dolt is gone, git is the only transport
- Running `bd` (no `km` prefix) — Go binary retired
- Running `km bd` from a slot worktree (`.claude/worktrees/wtN`) for non-slot beads — landed in slot, not visible from main
- Closing a bead without grep evidence in `--reason`
- Closing a bead because "the agent said done" — agents close aspirationally; verify with `km bd show <id>` and run the acceptance commands
- Adding `id:` frontmatter to normal path-form beads — the path is the id. Use `aliases:` for old names.
- Moving a parent bead body into its child directory as `@km/<scope>/<slug>/<slug>.md` — bead children use sibling layout: `@km/<scope>/<slug>.md` plus `@km/<scope>/<slug>/`.
- Using `--parent km-silvery --id better-scroll-defaults` for a scoped bead — use `--id @km/silvery/better-scroll-defaults`
- Using `--id wt.1` expecting it to auto-scope to `@km/wt/1` — auto-scope-derive was removed (4734b3bb1); use `--id @km/wt/1`
- Re-creating a bead someone else already filed — search `km bd list --status open` first

## Deeper references

For workflow specifics that don't belong in this canonical surface:

- `.claude/skills/pm/create.md` — bd create recipes (epic, sub-bead, with parent)
- `.claude/skills/pm/labels.md` — label conventions (`@person`, `#tag`, `+project`)
- `.claude/skills/pm/verify.md` — closure verification protocol
- `.claude/skills/pm/beads-ids.md` — id-form deep dive
- `.claude/skills/pm/workflows/retrospective.md` — epic-close retrospectives
- `.claude/skills/pm/workflows/rebase.md` — bead state during rebase
- `.claude/skills/pm/workflows/upstream.md` — filing issues on external repos
- `.claude/skills/pm/workflows/bugs.md` — bug-specific closure protocol
