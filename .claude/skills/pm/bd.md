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
bd list --title mdtest      # Search title
bd list --all               # Include closed
bd list --limit 0           # Unlimited
bd list --json | jq -r '.[] | "\(.id) \(.title)"'
```

## Creating Beads

**See [naming.md](naming.md) for ID conventions.**

```bash
# With explicit ID (preferred)
bd create --id km-storage.bug-3-sync-race --type bug --title "Race in file sync"

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

## Updating Beads

```bash
bd update km-abc123 --status in_progress
bd update km-abc123 --claim           # Atomic claim
bd update km-abc123 --notes "Progress: fixed X, still need Y"
bd update km-abc123 --priority 1
bd update km-abc123 --title "New title"
bd update km-abc123 --status in_progress --priority 0 --notes "Starting"
```

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
