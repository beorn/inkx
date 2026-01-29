---
description: Full bd CLI reference
---

# bd CLI Reference

**Keywords**: bd command, bd list, bd create, bd update, bd show

Full reference for the standalone `bd` CLI.

## Important: Two bd Commands

- `bd` (standalone, installed via nix) - **Use this!** Has `--type`, `--description`, `--parent`, etc.
- `bun km bd` (CLI wrapper) - Different flags, limited options

Always prefer standalone `bd` for creating and updating beads.

## Data Model

A **bead** is an issue/task/bug with these core fields:

| Field         | Type              | Description                                                      |
| ------------- | ----------------- | ---------------------------------------------------------------- |
| `id`          | string (required) | Unique ID - see [beads-ids.md](beads-ids.md) for conventions     |
| `title`       | string (required) | Short summary (< 80 chars)                                       |
| `issue_type`  | enum (required)   | `bug`, `feature`, `task`, `epic`, `chore`                        |
| `status`      | enum              | `open` (default), `in_progress`, `blocked`, `deferred`, `closed` |
| `priority`    | int (0-4)         | 0=P0 (highest), 4=P4 (lowest), default=2                         |
| `description` | string            | Full description (markdown supported)                            |
| `notes`       | string            | Status updates, progress notes                                   |
| `assignee`    | string            | Who is responsible (session ID or username)                      |
| `actor`       | string            | Who performed last action (audit trail)                          |
| `parent`      | string            | Parent bead ID (for hierarchical tracking)                       |
| `created_at`  | timestamp         | When created                                                     |
| `created_by`  | string            | Who created it                                                   |
| `updated_at`  | timestamp         | Last update time                                                 |

**Storage**: SQLite database at `.beads/beads.db`, synced to `.beads/issues.jsonl` for git tracking.

**Actor vs Assignee**:

- `assignee` = who owns the work (current responsibility)
- `actor` = who performed the last action (audit trail)

**Typical lifecycle**:

```
open (no assignee)
  → in_progress (assignee set via --claim)
  → closed (--reason required)
```

## Querying Beads

```bash
bd show km-abc123           # Human-readable
bd show km-abc123 --json    # JSON for scripting
bd show km-abc123 --json | jq -r '.[0].status' # or id, title, description, issue_type, created_at/by, updated_at, title
```

## Listing & Filtering

```bash
bd list                     # Open issues (limit 50)
bd list --status open
bd list --status in_progress
bd list --type bug
bd list --priority 0        # P0 only
bd list --priority-max 1    # P0 and P1
bd list --assignee beorn
bd list --no-assignee       # Unassigned
bd list --title mdtest      # Search title
bd list --all               # Include closed
bd list --limit 0           # Unlimited
bd list --json | jq -r '.[] | "\(.id) \(.title)"'
```

## Creating Beads

**See [beads-ids.md](beads-ids.md) for full ID conventions.**

### ID Pattern

```text
km-<scope>-<N>         # Package-specific (recommended)
km-<scope>-<N>.<N>     # Subtasks under parent
km-<keyword>           # Cross-cutting/named initiatives
```

**Scope tokens**: storage, board, tree, tui, cli, markdown, beads, agent

**Examples:**

```bash
# Find next number for scope
bd list --all | grep "km-storage-"

# Package-specific bug
bd create --id km-storage-15 --type bug --title "Race in file sync"

# Feature with subtasks
bd create --id km-tui-8 --type feature --priority 1 \
  --title "Add vim keybindings" \
  --description "Full description here"

bd create --id km-tui-8.1 --type task \
  --title "Normal mode navigation" \
  --parent km-tui-8

# Cross-cutting initiative (keyword-based)
bd create --id km-dark-mode --type epic --title "Dark mode support"

# Quick capture (outputs only ID)
bd q "Quick note about issue"
```

## Updating Beads

```bash
bd update km-abc123 --status in_progress
bd update km-abc123 --notes "Progress: fixed X, still need Y"
bd update km-abc123 --priority 1
bd update km-abc123 --title "New title"
bd update km-abc123 --status in_progress --priority 0 --notes "Starting"
```

## Claiming & Unclaiming Work

**Claim** = assign to yourself + set status to in_progress (atomic operation).

```bash
# Claim a bead (REQUIRED before starting work)
bd update <id> --claim

# What --claim does:
#   1. Sets assignee to $BD_ACTOR or $USER
#   2. Sets status to in_progress
#   3. Fails if already claimed by someone else (prevents conflicts)

# Forcibly take over (use for stale claims)
bd update <id> --claim              # Overwrites existing assignee

# Unclaim / release a bead (return to pool)
bd update <id> --assignee "" --status open

# Reassign to someone else
bd update <id> --assignee "other-person"
```

**Workflow:**

1. `bd ready` → find available work
2. `bd update <id> --claim` → claim before coding
3. Do the work
4. `bd close <id> --reason "..."` → marks done, clears assignee

**Stale claim guidelines:**

- Agent claims (`claude:*`): Stale after ~20 min inactivity
- User claims (`beorn`): Stale after ~24 hours inactivity
- Check: `bd show <id> --json | jq -r '.updated_at'`

## Closing Beads

```bash
bd close km-abc123 --reason "Fixed in commit abc123"
bd close km-abc123 --suggest-next
```

## Ready Work

```bash
bd ready                    # Open, no blockers
bd ready --type bug
bd ready --priority 0
bd ready --unassigned
```

## JSON Fields

`bd show <id> --json` returns:

| Field         | Description                                  |
| ------------- | -------------------------------------------- |
| `id`          | Bead ID                                      |
| `title`       | Short summary                                |
| `description` | Full description                             |
| `notes`       | Status updates                               |
| `status`      | open, in_progress, blocked, deferred, closed |
| `priority`    | 0-4 (P0=highest)                             |
| `issue_type`  | bug, feature, task, epic, chore              |
| `assignee`    | Session ID or username                       |
| `parent`      | Parent bead ID                               |
| `actor`       | Who performed the action (audit trail)       |

## Actor Attribution (Audit Trail)

The `bd` command tracks who performs actions via the `--actor` flag. This is automatically set by environment variables:

- **User operations**: Uses `$USER` (typically "beorn")
- **Agent operations**: Uses `$BD_ACTOR` (set by Claude Code session prehook to "claude:sessionId")
- **Manual override**: `bd update <id> --actor "custom-name"`

The Claude Code session prehook (in `.claude/settings.json`) automatically exports `BD_ACTOR=claude:<sessionId>` for each agent session, making every Claude instance a distinct actor. All bd commands in that session (update, create, close, etc.) automatically inherit this actor.

**Examples:**

```bash
# Agent session (BD_ACTOR=claude:abc12345)
/pm work km-123          # Sets actor=claude:abc12345, assignee=abc12345
bd create --id km-456 --title "Fix bug"  # Sets actor=claude:abc12345
bd close km-789          # Sets actor=claude:abc12345

# User shell (BD_ACTOR not set, uses $USER)
bd update km-123 --claim # Sets actor=beorn, assignee=beorn
```

**Querying by actor:**

```bash
# View all beads with actor metadata
bd list --json | jq '.[] | {id, assignee, actor}'

# Check who claimed/closed a bead
bd show km-123 --json | jq -r '.[0].actor'
```

No special handling needed in commands - the actor is set automatically based on your environment.

## Common Mistakes

These flags DON'T EXIST - check `bd <cmd> --help` if unsure:

| Wrong                 | Correct                                                 |
| --------------------- | ------------------------------------------------------- |
| `bd close --note "x"` | `bd close --reason "x"`                                 |
| `bd update --id km-x` | `bd update km-x` (positional)                           |
| `bd create --name`    | `bd create --title` or `bd create <title>` (positional) |
| `bd update --desc`    | `bd update --description` or `-d`                       |

**Note**: `--description` and `--notes` are BOTH valid on `bd update` but serve different purposes:

- `--description` / `-d`: Full issue description (main content)
- `--notes`: Additional status updates, progress notes
