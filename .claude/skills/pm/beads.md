---
description: Full km bd CLI reference
---

# km bd CLI Reference

**Keywords**: bd command, km bd list, km bd create, km bd update, km bd show

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
| `defer_until` | timestamp         | Hidden from `km bd ready` until this time                           |
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
km bd show km-abc123           # Human-readable
km bd show km-abc123 --json    # JSON for scripting
km bd show km-abc123 --json | jq -r '.[0].status'
```

## Listing & Filtering

```bash
km bd list                     # Open issues (limit 50)
km bd list --status open
km bd list --status in_progress
km bd list --type bug
km bd list --priority 0        # P0 only
km bd list --priority-max 1    # P0 and P1
km bd list --assignee beorn
km bd list --no-assignee       # Unassigned
km bd list --title mdspec      # Search title
km bd list --all               # Include closed
km bd list --limit 0           # Unlimited
km bd list --tree              # Hierarchical tree format
km bd list --long              # Detailed multi-line output
km bd list --parent km-tui     # Children of a parent (replaces grep)
km bd list --ready             # Only ready issues (open, not blocked/deferred)
km bd list --overdue           # Due date in the past
km bd list --deferred          # Deferred issues
km bd list --due-before tomorrow  # Due soon
km bd list --label-any sync,watcher  # OR: has ANY of these labels
km bd list --label sync --label watcher  # AND: has ALL of these labels
km bd list --label-pattern "tech-*"  # Glob pattern match on labels
km bd list --sort updated      # Sort by updated, created, priority, etc.
km bd list --json | jq -r '.[] | "\(.id) \(.title)"'
```

## Query Language

`km bd query` supports compound filters with boolean operators:

```bash
km bd query "status=open AND priority<=2"
km bd query "status=open AND type=bug AND updated>7d"
km bd query "(status=open OR status=blocked) AND priority<2"
km bd query "assignee=none AND type=task"
km bd query "title=authentication AND priority=0"
km bd query "parent=km-tui AND status!=closed"
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
km bd list --limit 1
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
km bd create --id km-storage-15 --type bug --title "Race in file sync" \
  --description "Files occasionally not written when..." \
  --priority 0 --labels sync

# With inline dependencies
km bd create --id km-tui-8.1 --type task --title "Normal mode navigation" \
  --deps "blocks:km-tui-8"

# With due date and deferral
km bd create --id km-infra.ci --type task --title "Setup CI" \
  --due "next monday" --defer "tomorrow"

# With acceptance criteria and design notes
km bd create --id km-tui.search --type feature --title "Search bar" \
  --acceptance "User can search by title" \
  --design "Use fuzzy matching via fzf algorithm"

# Quick capture (outputs only ID — great for scripting)
km bd q "Quick note about issue"
km bd q "Fix login bug" -t bug -p 1
ISSUE=$(km bd q "New feature")    # Capture ID in variable

# Set parent AFTER creation (--id and --parent cannot be used together)
km bd update km-tui-8.1 --parent km-tui-8
```

## Updating Beads

```bash
km bd update km-abc123 --status in_progress
km bd update km-abc123 --notes "Progress: fixed X, still need Y"
km bd update km-abc123 --append-notes "Additional context"  # Appends, doesn't overwrite
km bd update km-abc123 --priority 1
km bd update km-abc123 --title "New title"
km bd update km-abc123 --description "Updated description"
km bd update km-abc123 --design "New design notes"
km bd update km-abc123 --acceptance "Updated criteria"
km bd update km-abc123 --due "next friday"
km bd update km-abc123 --due ""       # Clear due date

# Label management on update
km bd update km-abc123 --add-label sync,watcher
km bd update km-abc123 --remove-label watcher
km bd update km-abc123 --set-labels sync,parser  # Replace all labels
```

## Claiming & Unclaiming Work

**Claim** = assign to yourself + set status to in_progress (atomic operation).

```bash
# Claim a bead (REQUIRED before starting work)
km bd update <id> --claim

# What --claim does:
#   1. Sets assignee to $BD_ACTOR or $USER
#   2. Sets status to in_progress
#   3. Fails if already claimed by someone else (prevents conflicts)

# Unclaim / release a bead (return to pool)
km bd update <id> --assignee "" --status open

# Reassign to someone else
km bd update <id> --assignee "other-person"
```

**Workflow:**

1. `km bd ready` → find available work
2. `km bd update <id> --claim` → claim before coding
3. Do the work
4. `km bd close <id> --reason "..."` → marks done, clears assignee

**Stale claim guidelines:**

- Agent claims (`claude:*`): Stale after ~20 min inactivity
- User claims (`beorn`): Stale after ~24 hours inactivity
- Check: `km bd show <id> --json | jq -r '.updated_at'`

## Closing Beads

```bash
km bd close km-abc123 --reason "Fixed in commit abc123"
km bd close km-abc123 --suggest-next    # Show newly unblocked issues after closing
km bd close km-abc123 km-def456         # Close multiple at once
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
   km bd update <id> --append-notes "HH:MM — User feedback: <exact feedback as given>"
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
km bd update km-tui.hr-render --append-notes "16:30 — User feedback: HR should also have padding on both sides"
km bd update km-tui.hr-render --description "HR nodes render as a horizontal line (─) spanning the card width with 1-char padding on each side, aligned with card borders. No border box around HR. In edit mode, show raw content instead."
```

## Renaming Beads

```bash
km bd rename km-old-id km-new-id
```

This updates: the issue's primary ID, all references in other issues (descriptions, titles, notes), dependencies, labels, comments, and events. No need for manual grep + update.

## Deferring Beads

```bash
bd defer km-abc123                     # Defer (status-based, hidden from km bd ready)
bd defer km-abc123 --until=tomorrow    # Defer until specific time
bd defer km-abc123 --until="+1w"       # Defer for 1 week
bd defer km-abc123 km-def456           # Defer multiple
bd undefer km-abc123                   # Restore to open
```

Deferred issues don't show in `km bd ready` but remain visible in `km bd list`.

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
km bd ready                    # Open, no blockers
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
km bd stale                    # Issues not updated in 30+ days (default)
km bd stale --days 14          # Not updated in 14+ days
km bd stale --status in_progress  # Only stale in-progress items
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
km bd list --parent km-tui         # List children of an epic
km bd children km-tui              # Alternative: list child beads
```

## Dependencies

```bash
km bd dep add <issue> <depends-on>     # issue depends on depends-on
km bd blocked                          # Show all blocked issues
bd graph                            # Display dependency graph
```

## JSON Fields

`km bd show <id> --json` returns:

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
- **Manual override**: `km bd update <id> --actor "custom-name"`

The Claude Code session prehook (in `.claude/settings.json`) automatically exports `BD_ACTOR=claude:<sessionId>` for each agent session, making every Claude instance a distinct actor. All bd commands in that session (update, create, close, etc.) automatically inherit this actor.

No special handling needed in commands - the actor is set automatically based on your environment.

## Renaming / Re-IDing Beads

Use `km bd rename <old-id> <new-id>` — this automatically updates all references (deps, descriptions, titles, notes, labels, comments, events).

```bash
km bd rename km-w382l km-tui.nav      # Rename to descriptive ID
```

No need to manually grep for references — `km bd rename` handles everything.

---

## Common Mistakes

### CRITICAL: --id and --parent CANNOT be combined

`km bd create --id X --parent Y` **ALWAYS FAILS**. Use two steps:

```bash
km bd create --id km-tui.foo --type task --title "Foo"   # Step 1: create
km bd update km-tui.foo --parent km-tui                    # Step 2: set parent
```

### Other flag mistakes

These flags DON'T EXIST - check `km bd <cmd> --help` if unsure:

| Wrong                            | Correct                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `km bd close --note "x"`            | `km bd close --reason "x"`                                 |
| `km bd update --id km-x`            | `km bd update km-x` (positional)                           |
| `km bd create --name`               | `km bd create --title` or `km bd create <title>` (positional) |
| `km bd update --desc`               | `km bd update --description` or `-d`                       |
| `km bd create --id km-...` (in vendor) | Check prefix first: `km bd list --limit 1`              |
| Assume dot notation is km-only   | Dot notation works with any prefix (`km-silvery.bg-bleed`) |

**Note**: `--description` and `--notes` are BOTH valid on `km bd update` but serve different purposes:

- `--description` / `-d`: Full issue description (main content)
- `--notes`: Additional status updates, progress notes
- `--append-notes`: Append to existing notes (doesn't overwrite)
- `--design`: Design notes (separate field)
- `--acceptance`: Acceptance criteria (separate field)

## Advanced Features

### Wisps (Ephemeral Beads)

Wisps are ephemeral beads not exported to JSONL — useful for temporary tracking:

```bash
km bd create --ephemeral --title "Temporary investigation"
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
km bd agent state <agent-id> running   # Set agent state
km bd agent heartbeat <agent-id>       # Update activity timestamp
km bd agent show <agent-id>            # Show agent details
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
km bd --no-db list                   # JSONL-only mode (no SQLite)
km bd --readonly list                # Read-only mode (for sandboxes)
```
