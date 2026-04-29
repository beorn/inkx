---
description: Full km bd CLI reference — flags, fields, query DSL, common mistakes
---

# km bd CLI reference

**Keywords**: bd command, km bd list, km bd create, km bd update, km bd show, query DSL

The canonical surface (CLI shape, lifecycle, claim/close, naming) lives in **[.claude/skills/beads/SKILL.md](../beads/SKILL.md)**. This document is the deeper reference: every field, every flag, the query DSL, and the failure modes that bite repeatedly.

> **History note** (2026-04-29): the standalone Go `bd` binary and its Dolt backend (`.beads/beads.db`, `bd dolt push`) were retired. Today **`km bd` is the only implementation** — it stores beads as markdown under `@km/<scope>/<slug>.md` and uses `.km/state.db` as a gitignored FTS5 cache. References to `bd dolt`, `.beads/beads.db`, or "go-bd" in older docs/sessions are stale; they describe the world before the cutover.

## Data model

A **bead** is an issue/task/bug with these fields. The markdown frontmatter mirrors them 1:1.

| Field         | Type              | Description                                                      |
| ------------- | ----------------- | ---------------------------------------------------------------- |
| `id`          | string (required) | Unique ID — see [beads-ids.md](beads-ids.md) for conventions     |
| `title`       | string (required) | Short summary (< 80 chars)                                       |
| `issue_type`  | enum (required)   | `bug`, `feature`, `task`, `epic`, `chore`, `decision`, `docs`    |
| `status`      | enum              | `open` (default), `wip`, `blocked`, `done`, `dropped`            |
| `priority`    | int (0-4)         | 0=P0 (highest), 4=P4 (lowest), default=2                         |
| `description` | string            | Full description (markdown supported)                            |
| `notes`       | string            | Status updates, progress notes (append-only by convention)       |
| `design`      | string            | Design notes                                                     |
| `acceptance`  | string            | Acceptance criteria                                              |
| `assignee`    | string            | Who is responsible (session ID or username)                      |
| `actor`       | string            | Who performed last action (audit trail)                          |
| `parent`      | string            | Parent bead ID (for hierarchical tracking)                       |
| `due_at`      | timestamp         | Due date/time                                                    |
| `created_at`  | timestamp         | When created                                                     |
| `created_by`  | string            | Who created it                                                   |
| `updated_at`  | timestamp         | Last update time                                                 |

**Storage**: markdown file at `@km/<scope>/<slug>.md` (path-form id) with frontmatter. The local `.km/state.db` is a gitignored FTS5 cache, rebuilt from markdown on `km bd doctor` / `km doctor rebuild`. Git is the only transport — no separate sync step.

**Status names**: km bd accepts both `wip` and `in_progress` (alias). Canonical is `wip`.

**Actor vs Assignee**:

- `assignee` = who owns the work (current responsibility)
- `actor` = who performed the last action (audit trail)

**Typical lifecycle**:

```
open (no assignee)
  → wip (assignee set via --claim)
  → done (--reason required)
```

## Querying beads

```bash
km bd show km-abc123           # Human-readable
km bd show km-abc123 --json    # JSON for scripting
km bd show km-abc123 --json | jq -r '.[0].status'
```

Resolution: `km bd show` accepts path-form (`@km/silvercode/queue-stuck`), bd-form (`km-silvercode.queue-stuck`), and short id (`km-q5hji`).

## Listing & filtering

```bash
km bd list                          # Open issues (default)
km bd list --status open
km bd list --status wip
km bd list --type bug
km bd list --priority P0            # P0 only
km bd list --priority 0             # numeric form also accepted
km bd list --assignee beorn
km bd list --all                    # Include all statuses
km bd list --blocked                # Only blocked
km bd list --unblocked              # Only unblocked
km bd list --limit 50
km bd list --json | jq -r '.[] | "\(.id) \(.title)"'
```

For richer filters (boolean ops, date math, label matches), use `km bd query` with the DSL.

## Query DSL

`km bd query` supports compound filters with boolean operators:

```bash
km bd query "status=open AND priority<=2"
km bd query "status=open AND type=bug AND updated>7d"
km bd query "(status=open OR status=blocked) AND priority<2"
km bd query "assignee=none AND type=task"
km bd query "title=authentication AND priority=0"
km bd query "parent=km-tui AND status!=done"
```

Supports: `=`, `!=`, `>`, `>=`, `<`, `<=`, `AND`, `OR`, `NOT`, `()` grouping.
Fields: status, priority, type, assignee, label, title, description, notes, created, updated, closed, id, parent, ephemeral, pinned.
Dates: `7d` (7 days ago), `2w`, `24h`, `2025-01-15`, `tomorrow`, `next monday`.

## Creating beads

**See [beads-ids.md](beads-ids.md) for full ID conventions.**

### Check the prefix first

Different vaults/submodules have different ID prefixes. Verify before creating:

```bash
km bd info | grep prefix              # Show the configured prefix
km bd config get beads.prefix         # Same, direct
km bd list --limit 1                  # Or just see one issue's id
```

| Location | Prefix |
|----------|--------|
| km (main project) | `km-` |
| Other vaults | configured via `km bd config set beads.prefix <name>` |

**Never assume `km-`** — always verify in the current working directory.

### Create examples

```bash
# Full create with metadata
km bd create "Race in file sync" --type bug \
  --description "Files occasionally not written when..." \
  --priority P0 --id race-in-file-sync

# Create under a parent (split shortcut: --parent + --id)
km bd create "Normal mode navigation" --type task \
  --parent km-tui --id normal-mode-nav

# With acceptance criteria and design notes
km bd create "Search bar" --type feature --id search-bar \
  --acceptance "User can search by title" \
  --design "Use fuzzy matching via fzf algorithm"
```

**`--id` is the full identity. `--parent` is a split shortcut for `--id <parent>/<leaf>`.** If both are passed and they overlap (e.g. `--parent foo --id foo/bar`), the command errors. Auto-scope-derive (`--id wt.1` → parent `@km/wt`) was removed 2026-04-29.

## Updating beads

```bash
km bd update km-abc123 --status wip
km bd update km-abc123 --notes "Progress: fixed X, still need Y"   # Appends a child paragraph
km bd update km-abc123 --priority P1
km bd update km-abc123 --title "New title"
km bd update km-abc123 --description "Updated description"         # Replaces first child paragraph
km bd update km-abc123 --type task
km bd update km-abc123 --parent km-tui                             # Move under a new parent
```

Notes vs description:

- `--description` / `-d`: rewrites the bead's first child paragraph (the "current state of truth")
- `--notes` / `-n`: appends a new child paragraph (chronological log)

## Claiming & unclaiming work

**Claim** = assign to yourself + set status to `wip` (atomic).

```bash
# Claim a bead (REQUIRED before starting work)
km bd update <id> --claim
# or:
km bd claim <id>

# What --claim does:
#   1. Sets assignee to $BD_ACTOR or $USER
#   2. Sets status to wip
#   3. Fails if already claimed by someone else (prevents conflicts)

# Unclaim / release
km bd update <id> --assignee "" --status open

# Reassign to someone else
km bd update <id> --assignee "other-person"
```

**Workflow:**

1. `km bd ready` → find available work
2. `km bd update <id> --claim` → claim before coding
3. Do the work
4. `km bd close <id> --reason "shipped <SHA> — what changed"` → marks done, clears assignee

**Stale claim guidelines:**

- Agent claims (`claude:*`): stale after ~20 min inactivity
- User claims (`beorn`): stale after ~24 hours inactivity
- Check: `km bd show <id> --json | jq -r '.[0].updated_at'`

## Closing beads

```bash
km bd close km-abc123 --reason "Fixed in commit abc123 — apps/foo/tests/bar.test.ts: 5/5 pass"
km bd drop km-abc123  --reason "Won't fix — superseded by km-def456"
```

Closing requires a `--reason` with evidence. See [verify.md](verify.md) for the full closure protocol.

## User feedback on beads

Beads have two layers that serve different purposes:

- **`description`** = current state of truth. Always reflects the latest understanding. Rewritten (not appended) when feedback changes the picture.
- **`notes`** = chronological log. Append-only record of what was said and when.

Together: the description tells you what the bead IS right now, the notes tell you HOW it got there.

### When the user gives feedback on a bead:

1. **Log the feedback verbatim** in notes with timestamp:
   ```bash
   km bd update <id> --notes "HH:MM — User feedback: <exact feedback as given>"
   ```

2. **Rewrite/update the bead** to integrate the feedback:
   - Update `--description` to reflect the current understanding (not append — rewrite)
   - Update `--title` if the feedback changes the scope or framing
   - Update `--acceptance` if acceptance criteria changed

3. **If you disagree, are unclear, or have a better idea**, ask the user **immediately** —
   don't silently ignore feedback, defer the question, or swallow a disagreement.
   Misunderstandings compound; catch them early. A respectful pushback is always welcome.

**Example:**
```bash
# User says: "actually the HR should also have padding on both sides"
km bd update km-tui.hr-render --notes "16:30 — User feedback: HR should also have padding on both sides"
km bd update km-tui.hr-render --description "HR nodes render as a horizontal line (─) spanning the card width with 1-char padding on each side, aligned with card borders. No border box around HR. In edit mode, show raw content instead."
```

## Renaming beads

```bash
km bd rename km-old-id km-new-id
```

This rewrites all incoming references (deps, descriptions, titles, notes, labels, comments). Use it instead of manual grep-and-update. Default rewrites everywhere; `--no-rewrite-refs` disables.

## Comments

```bash
km bd comment list <id>                    # List comments on a bead
km bd comment add <id> "This is a comment" # Append to the bead's `## Comments @comments` section
```

Comments live in the bead's markdown body, not in a separate database.

## Stale issues

```bash
km bd stale                       # Issues not updated in 30+ days (default)
km bd stale --days 14             # Not updated in 14+ days
```

## Dependencies

```bash
km bd dep add <id> <depends-on>   # issue is blocked by depends-on
km bd dep remove <id> <depends-on>
km bd dep list <id>               # List dependencies for an issue
km bd blocked                     # Show all blocked issues
```

## JSON fields

`km bd show <id> --json` returns:

| Field         | Description                                  |
| ------------- | -------------------------------------------- |
| `id`          | Bead ID                                      |
| `title`       | Short summary                                |
| `description` | Full description                             |
| `notes`       | Status updates                               |
| `design`      | Design notes                                 |
| `acceptance`  | Acceptance criteria                          |
| `status`      | open, wip, blocked, done, dropped            |
| `priority`    | 0-4 (P0=highest)                             |
| `issue_type`  | bug, feature, task, epic, chore, decision, docs |
| `assignee`    | Session ID or username                       |
| `parent`      | Parent bead ID                               |
| `actor`       | Who performed the action (audit trail)       |
| `due_at`      | Due date/time                                |

## Actor attribution (audit trail)

`km bd` tracks who performs actions via `--actor`. This is set automatically from environment variables:

- **User operations**: `$USER` (typically "beorn")
- **Agent operations**: `$BD_ACTOR` (set by Claude Code session prehook to `claude:<sessionId>`)
- **Manual override**: `km bd update <id> --actor "custom-name"`

The Claude Code session prehook (in `.claude/settings.json`) automatically exports `BD_ACTOR=claude:<sessionId>` per session, so every Claude instance is a distinct actor. All `km bd` commands in that session inherit it.

## Doctor & migrations

```bash
km bd doctor                      # Layout diagnostics + one-shot migrations
km bd info                        # Beads configuration and statistics
km bd where [scope]               # Show beads paths and prefix config
km bd config get|set <key> [value]
km bd migrate <source-jsonl>      # Import from external (Asana, etc.) into imports/<source>-<date>/
km bd export                      # Dump for sharing
```

## Memories

```bash
km bd remember "<insight>"        # Save a memory under mem/<slug>.md
km bd memories [keyword]          # List or search memories
km bd prime                       # Print workflow context + recent memories
```

## Common mistakes

### `--id` and `--parent` overlap

`--id` is the full identity. `--parent X --id <leaf>` is a split shortcut. Passing both with overlap (`--parent foo --id foo/bar`) errors out.

```bash
# These are equivalent:
km bd create "Normal mode nav" --id @km/tui/normal-mode-nav --type task
km bd create "Normal mode nav" --parent km-tui --id normal-mode-nav --type task

# This errors (overlap):
km bd create "Normal mode nav" --parent km-tui --id km-tui.normal-mode-nav --type task

# This is just the literal id "wt.1" (no auto-scope-derive):
km bd create "Slot 1" --id wt.1
# To put it under @km/wt, write either form explicitly:
km bd create "Slot 1" --parent km-wt --id 1
km bd create "Slot 1" --id @km/wt/1
```

### Other flag mistakes

These flags DON'T EXIST — check `km bd <cmd> --help` if unsure:

| Wrong                              | Correct                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `km bd close --note "x"`           | `km bd close --reason "x"`                            |
| `km bd update --id km-x`           | `km bd update km-x` (positional)                      |
| `km bd create --name`              | `km bd create --title` or `km bd create <title>` (positional) |
| `km bd update --desc`              | `km bd update --description` or `-d`                  |
| `km bd update --append-notes`      | `km bd update --notes` (already appends)              |
| Use bare `bd` (no `km` prefix)     | Always `km bd` — the Go binary is gone                |
| Run `bd dolt push`                 | Just `git add @km/... && git commit && git push`      |

## Retired commands

These commands existed in the old Go `bd` binary and are **not present in `km bd`**. Older docs/sessions referencing them are stale:

- `bd defer / bd undefer` — no defer in km bd. Use `km bd update <id> --status blocked` if you really need to hide work.
- `bd find-duplicates` — no AI/text-similarity dedup. Manual: `km bd list --json | jq` then visual inspection.
- `bd graph` — no dep graph viz. `km bd dep list <id>` shows incoming deps.
- `bd promote / bd mol / bd swarm / bd formula` — no wisp/molecule/swarm machinery.
- `bd slot / bd gate` — no agent-slot or async-gate primitives.
- `bd backend` — no backend toggle (km bd is the only backend).
- `bd count` — use `km bd info` for stats, or `km bd list --json | jq 'group_by(.status)'`.
- `bd epic status / close-eligible` — no auto-close. Manual via `km bd children <epic>` + close.
- `bd label add/remove/list` — labels are part of the markdown body (sigils like `#bug`, `#P0`); use `km bd update --notes` or edit the markdown directly. `km bd query` supports `label=` filter.
- `bd search` — use `km bd list <query>` (positional, FTS) or `km bd query "title=..."`.
- `bd comments add/list` — replaced by `km bd comment add/list`.
- `bd delete` — beads are markdown files; `git rm @km/<path>.md && km bd doctor` rebuilds the index.

If you need any of these workflows, file a bead under `km-beads.<feature>` with the use case.
