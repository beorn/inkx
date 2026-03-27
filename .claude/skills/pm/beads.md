---
description: Full bd CLI reference
---

# bd CLI Reference

**Keywords**: bd command, bd list, bd create, bd update, bd show

Full reference for the standalone `bd` CLI (v0.50+).

## Important: Two Separate Implementations

There are two `bd` commands with **different data backends**:

- **`bd`** (standalone, installed via nix) — stores data in `.beads/` Dolt database. Full-featured: 50+ subcommands, `--description`, `--parent`, `--claim`, Dolt sync, etc. **Use this for all beads operations.**
- **`km bd`** (km CLI subcommand) — reimplements beads on top of km's markdown/SQLite data model (`@km/beads` package). Fewer features (~15 subcommands), different flags. Useful for querying km's own task tree but lags behind `bd` in capabilities.

These are NOT wrappers of each other. `km bd` queries km's repo node tree; `bd` queries the `.beads/` Dolt database. They share concepts (issues, dependencies, priorities) but have independent implementations and data stores.

Always prefer standalone `bd` for creating and updating beads. Use `km bd` only for km-specific operations (querying the markdown task tree, board filtering).

## Data Model

A **bead** is an issue/task/bug with these core fields:

| Field         | Type              | Description                                                      |
| ------------- | ----------------- | ---------------------------------------------------------------- |
| `id`          | string (required) | Unique ID - see [beads-ids.md](beads-ids.md) for conventions     |
| `title`       | string (required) | Short summary (< 80 chars)                                       |
| `issue_type`  | enum (required)   | `bug`, `feature`, `task`, `epic`, `chore`, `decision`            |
| `status`      | enum              | `open` (default), `in_progress`, `blocked`, `deferred`, `closed` |
| `priority`    | int (0-4)         | 0=P0 (highest), 4=P4 (lowest), default=2                         |
| `description` | string            | Full description (markdown supported)                            |
| `notes`       | string            | Status updates, progress notes                                   |
| `design`      | string            | Design notes                                                     |
| `acceptance`  | string            | Acceptance criteria                                              |
| `assignee`    | string            | Who is responsible (session ID or username)                      |
| `actor`       | string            | Who performed last action (audit trail)                          |
| `parent`      | string            | Parent bead ID (for hierarchical tracking)                       |
| `due_at`      | timestamp         | Due date/time                                                    |
| `defer_until` | timestamp         | Hidden from `bd ready` until this time                           |
| `ephemeral`   | bool              | If true, not exported to JSONL (wisp)                            |
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
bd show km-abc123 --json | jq -r '.[0].status'
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
bd list --title mdspec      # Search title
bd list --all               # Include closed
bd list --limit 0           # Unlimited
bd list --tree              # Hierarchical tree format
bd list --long              # Detailed multi-line output
bd list --parent km-tui     # Children of a parent (replaces grep)
bd list --ready             # Only ready issues (open, not blocked/deferred)
bd list --overdue           # Due date in the past
bd list --deferred          # Deferred issues
bd list --due-before tomorrow  # Due soon
bd list --label-any sync,watcher  # OR: has ANY of these labels
bd list --label sync --label watcher  # AND: has ALL of these labels
bd list --label-pattern "tech-*"  # Glob pattern match on labels
bd list --sort updated      # Sort by updated, created, priority, etc.
bd list --json | jq -r '.[] | "\(.id) \(.title)"'
```

## Query Language

`bd query` supports compound filters with boolean operators:

```bash
bd query "status=open AND priority<=2"
bd query "status=open AND type=bug AND updated>7d"
bd query "(status=open OR status=blocked) AND priority<2"
bd query "assignee=none AND type=task"
bd query "title=authentication AND priority=0"
bd query "parent=km-tui AND status!=closed"
```

Supports: `=`, `!=`, `>`, `>=`, `<`, `<=`, `AND`, `OR`, `NOT`, `()` grouping.
Fields: status, priority, type, assignee, label, title, description, notes, created, updated, closed, id, parent, ephemeral, pinned.
Dates: `7d` (7 days ago), `2w`, `24h`, `2025-01-15`, `tomorrow`, `next monday`.

## Text Search

`bd search` searches across title, description, and ID:

```bash
bd search "authentication bug"
bd search "login" --status open
bd search "database" --label backend --limit 10
bd search "bd-5q"                      # Partial ID match
bd search "security" --priority-min 0 --priority-max 2
bd search "bug" --created-after 2025-01-01
bd search "api" --desc-contains "endpoint"
bd search "cleanup" --no-assignee --no-labels
bd search "refactor" --sort priority
```

## Creating Beads

**See [beads-ids.md](beads-ids.md) for full ID conventions.**

### Check Database Prefix First

**CRITICAL**: Different projects/submodules have different ID prefixes. Check before creating:

```bash
# See what prefix the database uses
bd list --limit 1
```

| Location | Prefix |
|----------|--------|
| km (main project) | `km-` |
| vendor/silvery | `silvery-` |
| vendor/silvery/packages/ansi | `silvery/packages/ansi-` |
| Other vendor packages | `beorn-<name>-` |

**Never assume `km-`** — always verify for the current working directory.

### Create Examples

```bash
# Full create with metadata
bd create --id km-storage-15 --type bug --title "Race in file sync" \
  --description "Files occasionally not written when..." \
  --priority 0 --labels sync

# With inline dependencies
bd create --id km-tui-8.1 --type task --title "Normal mode navigation" \
  --deps "blocks:km-tui-8"

# With due date and deferral
bd create --id km-infra.ci --type task --title "Setup CI" \
  --due "next monday" --defer "tomorrow"

# With acceptance criteria and design notes
bd create --id km-tui.search --type feature --title "Search bar" \
  --acceptance "User can search by title" \
  --design "Use fuzzy matching via fzf algorithm"

# Quick capture (outputs only ID — great for scripting)
bd q "Quick note about issue"
bd q "Fix login bug" -t bug -p 1
ISSUE=$(bd q "New feature")    # Capture ID in variable

# Set parent AFTER creation (--id and --parent cannot be used together)
bd update km-tui-8.1 --parent km-tui-8
```

## Updating Beads

```bash
bd update km-abc123 --status in_progress
bd update km-abc123 --notes "Progress: fixed X, still need Y"
bd update km-abc123 --append-notes "Additional context"  # Appends, doesn't overwrite
bd update km-abc123 --priority 1
bd update km-abc123 --title "New title"
bd update km-abc123 --description "Updated description"
bd update km-abc123 --design "New design notes"
bd update km-abc123 --acceptance "Updated criteria"
bd update km-abc123 --due "next friday"
bd update km-abc123 --due ""       # Clear due date

# Label management on update
bd update km-abc123 --add-label sync,watcher
bd update km-abc123 --remove-label watcher
bd update km-abc123 --set-labels sync,parser  # Replace all labels
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
bd close km-abc123 --suggest-next    # Show newly unblocked issues after closing
bd close km-abc123 km-def456         # Close multiple at once
```

<a name="user-feedback"></a>

## User Feedback on Beads

Beads have two layers that serve different purposes:

- **`description`** = current state of truth. Always reflects the latest understanding. Rewritten (not appended) when feedback changes the picture.
- **`notes`** = chronological log. Append-only record of what was said and when.

Together: the description tells you what the bead IS right now, the notes tell you HOW it got there.

### When the user gives feedback on a bead:

1. **Log the feedback verbatim** in notes with timestamp:
   ```bash
   bd update <id> --append-notes "HH:MM — User feedback: <exact feedback as given>"
   ```

2. **Rewrite/update the bead** to integrate the feedback:
   - Update `--description` to reflect the current understanding (not append — rewrite the whole thing)
   - Update `--title` if the feedback changes the scope or framing
   - Update `--acceptance` if acceptance criteria changed

3. **If you disagree, are unclear, or have a better idea**, ask the user **immediately** —
   don't silently ignore feedback, defer the question, or swallow a disagreement.
   Misunderstandings compound; catch them early. A respectful pushback is always welcome.

**Example:**
```bash
# User says: "actually the HR should also have padding on both sides"
bd update km-tui.hr-render --append-notes "16:30 — User feedback: HR should also have padding on both sides"
bd update km-tui.hr-render --description "HR nodes render as a horizontal line (─) spanning the card width with 1-char padding on each side, aligned with card borders. No border box around HR. In edit mode, show raw content instead."
```

## Renaming Beads

```bash
bd rename km-old-id km-new-id
```

This updates: the issue's primary ID, all references in other issues (descriptions, titles, notes), dependencies, labels, comments, and events. No need for manual grep + update.

## Deferring Beads

```bash
bd defer km-abc123                     # Defer (status-based, hidden from bd ready)
bd defer km-abc123 --until=tomorrow    # Defer until specific time
bd defer km-abc123 --until="+1w"       # Defer for 1 week
bd defer km-abc123 km-def456           # Defer multiple
bd undefer km-abc123                   # Restore to open
```

Deferred issues don't show in `bd ready` but remain visible in `bd list`.

## Comments

```bash
bd comments km-abc123                  # List all comments
bd comments add km-abc123 "This is a comment"
bd comments add km-abc123 -f notes.txt  # From file
```

## Deleting Beads

```bash
bd delete km-abc123 --force            # Delete (preview first without --force)
bd delete km-abc123 --dry-run          # Preview what would be deleted
bd delete km-abc123 --cascade --force  # Recursively delete all dependents
bd delete --from-file deletions.txt --force  # Batch delete from file
bd delete km-abc123 --reason "Created in error"  # With audit trail
```

## Ready Work

```bash
bd ready                    # Open, no blockers
```

## Counting & Statistics

```bash
bd count                          # Total count
bd count --status open            # Open issues
bd count --by-status              # Group by status
bd count --by-priority            # Group by priority
bd count --by-type                # Group by issue type
bd count --by-assignee            # Group by assignee
bd count --by-label               # Group by label
bd count --assignee alice --by-status  # Alice's issues by status
```

## Stale Issues

```bash
bd stale                    # Issues not updated in 30+ days (default)
bd stale --days 14          # Not updated in 14+ days
bd stale --status in_progress  # Only stale in-progress items
```

## Duplicate Detection

```bash
bd find-duplicates                       # Mechanical text similarity
bd find-duplicates --threshold 0.4       # Lower threshold = more results
bd find-duplicates --method ai           # AI-powered semantic comparison
bd find-duplicates --status open         # Only check open issues
```

## Epic Management

```bash
bd epic status                  # Show epic completion status
bd epic close-eligible          # Close epics where all children are complete
bd list --parent km-tui         # List children of an epic
bd children km-tui              # Alternative: list child beads
```

## Dependencies

```bash
bd dep add <issue> <depends-on>     # issue depends on depends-on
bd blocked                          # Show all blocked issues
bd graph                            # Display dependency graph
```

## JSON Fields

`bd show <id> --json` returns:

| Field         | Description                                  |
| ------------- | -------------------------------------------- |
| `id`          | Bead ID                                      |
| `title`       | Short summary                                |
| `description` | Full description                             |
| `notes`       | Status updates                               |
| `design`      | Design notes                                 |
| `acceptance`  | Acceptance criteria                          |
| `status`      | open, in_progress, blocked, deferred, closed |
| `priority`    | 0-4 (P0=highest)                             |
| `issue_type`  | bug, feature, task, epic, chore, decision    |
| `assignee`    | Session ID or username                       |
| `parent`      | Parent bead ID                               |
| `actor`       | Who performed the action (audit trail)       |
| `due_at`      | Due date/time                                |
| `defer_until` | Defer until date/time                        |
| `ephemeral`   | Whether this is a wisp                       |

## Actor Attribution (Audit Trail)

The `bd` command tracks who performs actions via the `--actor` flag. This is automatically set by environment variables:

- **User operations**: Uses `$USER` (typically "beorn")
- **Agent operations**: Uses `$BD_ACTOR` (set by Claude Code session prehook to "claude:sessionId")
- **Manual override**: `bd update <id> --actor "custom-name"`

The Claude Code session prehook (in `.claude/settings.json`) automatically exports `BD_ACTOR=claude:<sessionId>` for each agent session, making every Claude instance a distinct actor. All bd commands in that session (update, create, close, etc.) automatically inherit this actor.

No special handling needed in commands - the actor is set automatically based on your environment.

## Renaming / Re-IDing Beads

Use `bd rename <old-id> <new-id>` — this automatically updates all references (deps, descriptions, titles, notes, labels, comments, events).

```bash
bd rename km-w382l km-tui.nav      # Rename to descriptive ID
```

No need to manually grep for references — `bd rename` handles everything.

---

## Common Mistakes

### CRITICAL: --id and --parent CANNOT be combined

`bd create --id X --parent Y` **ALWAYS FAILS**. Use two steps:

```bash
bd create --id km-tui.foo --type task --title "Foo"   # Step 1: create
bd update km-tui.foo --parent km-tui                    # Step 2: set parent
```

### Other flag mistakes

These flags DON'T EXIST - check `bd <cmd> --help` if unsure:

| Wrong                            | Correct                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `bd close --note "x"`            | `bd close --reason "x"`                                 |
| `bd update --id km-x`            | `bd update km-x` (positional)                           |
| `bd create --name`               | `bd create --title` or `bd create <title>` (positional) |
| `bd update --desc`               | `bd update --description` or `-d`                       |
| `bd create --id km-...` (in vendor) | Check prefix first: `bd list --limit 1`              |
| Assume dot notation is km-only   | Dot notation works with any prefix (`km-silvery.bg-bleed`) |

**Note**: `--description` and `--notes` are BOTH valid on `bd update` but serve different purposes:

- `--description` / `-d`: Full issue description (main content)
- `--notes`: Additional status updates, progress notes
- `--append-notes`: Append to existing notes (doesn't overwrite)
- `--design`: Design notes (separate field)
- `--acceptance`: Acceptance criteria (separate field)

## Advanced Features

### Wisps (Ephemeral Beads)

Wisps are ephemeral beads not exported to JSONL — useful for temporary tracking:

```bash
bd create --ephemeral --title "Temporary investigation"
bd promote km-abc123              # Promote wisp to permanent bead
bd promote km-abc123 --reason "Worth tracking long-term"
```

### Molecules & Formulas

Work templates for repeatable workflows:

```bash
bd formula list                   # Available workflow templates
bd mol pour <formula>             # Instantiate as persistent molecule
bd mol wisp <formula>             # Instantiate as ephemeral
bd mol progress <mol-id>          # Show molecule progress
```

### Swarms

Structured parallel work on epics:

```bash
bd swarm create <epic-id>         # Create swarm from epic
bd swarm status <swarm-id>        # Current status
bd swarm list                     # All swarm molecules
```

### Agent State (for multi-agent coordination)

```bash
bd agent state <agent-id> running   # Set agent state
bd agent heartbeat <agent-id>       # Update activity timestamp
bd agent show <agent-id>            # Show agent details
bd slot set <agent-id> hook <bead>  # Attach work to agent's hook
bd slot clear <agent-id> hook       # Clear agent's hook
```

### Gates (Async Coordination)

```bash
bd gate list                      # Show open gates
bd gate check                     # Evaluate all open gates
bd gate resolve <id>              # Manually resolve a gate
```

### Backend & Mode Options

```bash
bd backend show                   # Current backend (sqlite or dolt)
bd --no-db list                   # JSONL-only mode (no SQLite)
bd --readonly list                # Read-only mode (for sandboxes)
```
