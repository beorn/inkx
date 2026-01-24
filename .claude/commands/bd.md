---
description: Quick beads CLI access - run bd commands directly
argument-hint: [ready | list | show <id> | create | close <id> | <any bd args>]
allowed-tools: Bash, TodoWrite
---

# Beads CLI

Quick access to the `bd` CLI for issue tracking. Pass arguments directly to `bd`.

**Arguments**: $ARGUMENTS

## Routing

| Input         | Action                         |
| ------------- | ------------------------------ |
| (empty)       | `bd ready` - show actionable   |
| `ready`       | `bd ready`                     |
| `list`        | `bd list --status open --long` |
| `show <id>`   | `bd show <id>`                 |
| `create ...`  | `bd create ...`                |
| `close <id>`  | `bd close <id>`                |
| anything else | `bd $ARGUMENTS` (pass through) |

## Examples

```bash
/bd                      # Show ready work
/bd list                 # List open issues
/bd show km-abc1         # View issue details
/bd create --title="Fix bug" --type=bug --priority=2
/bd close km-abc1        # Close issue
/bd stale --days 7       # Custom: find stale issues
/bd log --limit 5        # Custom: recent activity
```

## Execute

Run the appropriate command based on arguments:

```bash
# If empty or "ready":
bd ready

# If "list":
bd list --status open --long

# Otherwise pass through:
bd $ARGUMENTS
```

After execution, if the output suggests follow-up actions (e.g., "claim this issue"), briefly mention them.

## For Complex Operations

For backlog grooming, triage, or multi-step issue management, use `/pm` instead.
