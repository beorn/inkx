---
description: Beads issue tracker with session coordination. Use when user asks "what should I work on?", "show available tasks", "claim this issue", "find work", or wants to coordinate work between sessions.
argument-hint: [ready|show|work|claim|release|close|sync|my|create|list] [id]
allowed-tools: Bash, Read, TodoWrite
---

# /bd - Beads Issue Tracker

Unified interface for beads issue tracking. Manage your work queue, coordinate with other Claude sessions, and track progress.

## Current State

!`bun ./.claude/skills/bd/scripts/bd.ts 2>/dev/null || echo "Run /bd to see dashboard"`

## Subcommands

| Command        | Description                               |
| -------------- | ----------------------------------------- |
| (none)         | Dashboard: ready work + active claims     |
| `ready`        | Show actionable work (no blockers)        |
| `show <id>`    | View bead details, dependencies, blockers |
| `work <id>`    | Start working: claim + show details       |
| `claim <id>`   | Claim bead for this session               |
| `release [id]` | Release claim (or all if no id)           |
| `close <id>`   | Complete work                             |
| `sync`         | Commit beads changes to git               |
| `my`           | Show this session's claims                |

## Workflow

1. **Find work:** `/bd` or `/bd ready`
2. **Claim work:** `/bd work <id>` — **MANDATORY before starting any implementation**
3. **Implement:** Do the work
4. **Complete:** `/bd close <id>`
5. **Commit:** `/bd sync`

**Important:** Always use `/bd work <id>` to claim work. This sets your session as the `assignee`, which:

- Prevents duplicate work across multiple Claude sessions
- Shows other sessions that this bead is actively being worked on
- Auto-expires after 30 min of inactivity

## Session Coordination

When multiple Claude Code sessions work on the same codebase:

- Claims expire after **30 minutes** of session inactivity
- Stale claims can be taken over by other sessions
- Use `/bd my` to see your active claims
- Use `/bd release` before switching tasks

## Direct bd Commands

Use standalone `bd` CLI (not `/bd` skill or `bun km bd`) for detailed queries and updates.

**Important:** There are two `bd` commands with different syntax:
- `bd` (standalone, installed via nix) - **Use this!** Has `--type`, `--description`, `--parent`, etc.
- `bun km bd` (CLI wrapper) - Different flags (`-t`, `-p`), limited options, creates in-memory only

Always prefer the standalone `bd` command for creating and updating beads.

### JSON Field Reference

`bd show <id> --json` returns array with these fields:
- `id` - Bead ID (e.g., "km-abc123")
- `title` - Short summary
- `description` - Full description (markdown)
- `notes` - Status update notes
- `status` - "open", "in_progress", "blocked", "deferred", "closed"
- `priority` - 0-4 (0=highest, P0-P4)
- `issue_type` - "bug", "feature", "task", "epic", "chore"
- `assignee` - Session ID or username
- `created_at`, `updated_at` - ISO timestamps
- `created_by` - Creator username
- `parent` - Parent bead ID (for child beads)
- `dependency_count`, `dependent_count` - Dependency counts

### Querying Beads

```bash
# Show bead (human-readable)
bd show km-abc123

# Show bead (JSON for scripting)
bd show km-abc123 --json

# Extract specific fields
bd show km-abc123 --json | jq -r '.[0].status'
bd show km-abc123 --json | jq -r '.[0].notes'
bd show km-abc123 --json | jq -r '.[0].assignee'

# Multiple fields at once
bd show km-abc123 --json | jq -r '.[0] | "\(.status) \(.priority) \(.assignee)"'
```

### Listing & Filtering

```bash
# List open issues (default: limit 50)
bd list

# Filter by status
bd list --status open
bd list --status in_progress
bd list --status closed

# Filter by type
bd list --type bug
bd list --type task

# Filter by priority (0=P0 highest, 4=P4 lowest)
bd list --priority 0          # P0 only
bd list --priority-max 1      # P0 and P1

# Filter by assignee
bd list --assignee beorn
bd list --no-assignee         # Unassigned

# Filter by title text
bd list --title mdtest        # Case-insensitive substring

# Combine filters
bd list --status open --type bug --priority-max 1

# Show all (including closed)
bd list --all

# Unlimited results
bd list --limit 0

# JSON output for scripting
bd list --json | jq -r '.[] | "\(.id) \(.title)"'
```

### Creating Beads

**See [naming.md](naming.md) for ID conventions.** Use meaningful IDs, not random ones.

```bash
# With explicit ID (preferred)
bd create --id km-storage.bug-3-sync-race --type bug --title "Race in file sync"

# Basic create (auto-generated ID)
bd create "Fix the bug" --type bug

# With description and priority
bd create --id km-tui.feat-1-vim-mode --type feature --priority 1 \
  --title "Add vim keybindings" \
  --description "Full description here"

# With parent (creates child bead)
bd create --id km-tui.feat-1-vim-mode.a --type task \
  --title "Normal mode navigation" \
  --parent km-tui.feat-1-vim-mode

# Quick capture (outputs only ID)
bd q "Quick note about issue"
```

### Updating Beads

```bash
# Update status
bd update km-abc123 --status in_progress
bd update km-abc123 --status open

# Claim (atomic: sets assignee + in_progress, fails if already claimed)
bd update km-abc123 --claim

# Update notes
bd update km-abc123 --notes "Progress: fixed X, still need Y"

# Update priority
bd update km-abc123 --priority 1

# Update title
bd update km-abc123 --title "New title"

# Multiple updates at once
bd update km-abc123 --status in_progress --priority 0 --notes "Starting work"
```

### Closing Beads

```bash
# Close with reason
bd close km-abc123 --reason "Fixed in commit abc123"

# Close and show next unblocked
bd close km-abc123 --suggest-next
```

### Ready Work

```bash
# Show ready work (open, no blockers)
bd ready

# Filter ready by type
bd ready --type bug

# Filter ready by priority
bd ready --priority 0

# Show unassigned only
bd ready --unassigned
```

## /bd Skill Examples

```bash
/bd                    # See dashboard
/bd ready              # Show work with no blockers
/bd work km-abc1       # Claim and start working on km-abc1
/bd show km-abc1       # View details without claiming
/bd close km-abc1      # Mark done
/bd sync               # Commit beads changes
```

## Common Patterns

### Find work by keyword
```bash
bd list --title "mdtest"          # Find beads with "mdtest" in title
bd list --title "sync" --type bug # Find sync-related bugs
```

### Check what's assigned to me
```bash
bd list --assignee $USER --status in_progress
```

### Get full context before starting
```bash
bd show km-abc123              # Human-readable details
bd show km-abc123 --json | jq  # Full JSON for inspection
```

### Atomic claim (safe for multi-session)
```bash
bd update km-abc123 --claim    # Fails if already claimed
```

### Track progress with notes
```bash
bd update km-abc123 --notes "Completed X, working on Y"
```

## Self-Improvement Rule

See CLAUDE.md "Documentation Self-Improvement" — when you run `bd` commands incorrectly, update this file with correct usage.

## Usage

```bash
bun ./.claude/skills/bd/scripts/bd.ts $ARGUMENTS
```
