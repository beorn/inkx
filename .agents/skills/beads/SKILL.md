---
description: "Beads — issue tracking with km bd. Canonical surface for the bead workflow: CLI, lifecycle, ids, claim/release, storage model. Load this for anything bead-related. /pm aliases here."
argument-hint: "[create | claim | close | list | show | ready | <bead-id>]"
allowed-tools: Bash, Read, Edit
benefits-from: [worktree, commit]
---

# Beads — issue tracking workflow

**Keywords**: bead, beads, km bd, issue, ticket, claim, close, ready, in_progress, P0, P1, P2, P3, P4, scope epic, sub-bead, parent, label

The single source of truth for bead operations. `/pm` is a thin alias that routes here for bead workflow; the deeper docs in `.agents/skills/pm/` are referenced for specific recipes (creation forms, label hygiene, retrospectives).

## Storage model — markdown files in the vault

Bead state is **per-vault markdown** under `@km/<scope>/<slug>.md` (path-form) or `km-<scope>.<slug>` (bd-form, equivalent alias). Beads ride the normal git transport — there is no separate `.beads/` directory or Dolt push. `km bd` reads/writes the markdown files plus the local index in `.km/state.db` (gitignored cache).

| Surface | What's there |
|---|---|
| `@km/<scope>/<slug>.md` | The bead — markdown body with frontmatter (id, aliases, type, priority, status, parent) |
| `.km/state.db` | Local FTS5 index (gitignored, rebuilt from markdown on `km doctor rebuild`) |
| `.km/changes.jsonl` | Event journal for in-flight mutations (gitignored) |

**Sync**: `git add @km/<scope>/<slug>.md && git commit && git push` — that's it. Don't ever run `bd dolt push` (the Go bd binary and Dolt backend were retired 2026-04-29; `bd` is no longer on PATH).

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
km bd migrate <source>                              # import from external (Asana, etc.)
km bd export                                        # dump for sharing
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

The exception: `km bd close km-wtN` (slot-bead self-close) IS run from inside `.claude/worktrees/wtN` because the slot's own lifecycle is local.

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
| Slot bead | `km-wt1`..`km-wt9` (lease beads for the worktree pool) |

Scope epics are permanent backlogs (per-package); they don't close. Project epics close when shipped.

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

If a bead description has numeric targets (≤12 useEffects, ≤1000 LOC, 0 TS errors): **run the grep/wc/tsc and paste the actual count** into the close reason. "Mostly done" is not done. The session that closed `km-tui.tree.v4 Phase 9` claiming "21 useEffects → still 21" is the canonical anti-pattern.

## Pairs with

- `/worktree` — slot beads `km-wt1`..`km-wt9` are the pool's locks
- `/commit` — git transport for bead markdown files
- `/complete` — completeness audit verifies bead-acceptance grep against origin/main
- `/pm` — alias and deeper recipe docs (`.agents/skills/pm/{create,verify,beads-ids,labels,workflows}.md`)

## Anti-patterns

- Running `bd dolt push` — Dolt is gone, git is the only transport
- Running `bd` (no `km` prefix) — Go binary retired
- Running `km bd` from a slot worktree (`.claude/worktrees/wtN`) for non-slot beads — landed in slot, not visible from main
- Closing a bead without grep evidence in `--reason`
- Closing a bead because "the agent said done" — agents close aspirationally; verify with `km bd show <id>` and run the acceptance commands
- Using `--parent km-silvery --id better-scroll-defaults` for a scoped bead — use `--id @km/silvery/better-scroll-defaults`
- Using `--id wt.1` expecting it to auto-scope to `@km/wt/1` — auto-scope-derive was removed (4734b3bb1); use `--id @km/wt/1`
- Re-creating a bead someone else already filed — search `km bd list --status open` first

## Deeper references

For workflow specifics that don't belong in this canonical surface:

- `.agents/skills/pm/create.md` — bd create recipes (epic, sub-bead, with parent)
- `.agents/skills/pm/labels.md` — label conventions (`@person`, `#tag`, `+project`)
- `.agents/skills/pm/verify.md` — closure verification protocol
- `.agents/skills/pm/beads-ids.md` — id-form deep dive
- `.agents/skills/pm/workflows/retrospective.md` — epic-close retrospectives
- `.agents/skills/pm/workflows/rebase.md` — bead state during rebase
- `.agents/skills/pm/workflows/upstream.md` — filing issues on external repos
- `.agents/skills/pm/workflows/bugs.md` — bug-specific closure protocol
