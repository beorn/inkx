---
description: Beads issue tracker with session coordination - claim, track, complete work
argument-hint: [ready|show|work|claim|release|close|sync|my|create] [id]
allowed-tools: Bash, TodoWrite
---

# /bd - Beads Issue Tracker

Unified interface for beads issue tracking with **session coordination** for claiming work.

**Arguments**: $ARGUMENTS

## Commands

| Command        | Description                               |
| -------------- | ----------------------------------------- |
| (none)         | Dashboard: ready work + active claims     |
| `ready`        | Show actionable work (no blockers)        |
| `show <id>`    | View bead details, dependencies, blockers |
| `work <id>`    | **Start working: claim + show details**   |
| `claim <id>`   | Claim bead for this session               |
| `release [id]` | Release claim (or all if no id)           |
| `close <id>`   | Complete work                             |
| `sync`         | Commit beads changes to git               |
| `my`           | Show this session's claims                |
| `create ...`   | Create new bead (passthrough to bd)       |
| `list ...`     | List beads (passthrough to bd)            |

## Workflow

1. **Find work:** `/bd` or `/bd ready`
2. **Start working:** `/bd work <id>` (claims and shows details)
3. **Implement:** Do the work
4. **Complete:** `/bd close <id>`
5. **Commit:** `/bd sync`

## Session Coordination

When multiple Claude Code sessions work on the same codebase:

- Claims expire after **30 minutes** of session inactivity
- Stale claims can be taken over by other sessions
- Use `/bd my` to see your active claims
- Use `/bd release` before switching tasks

## Examples

```bash
/bd                    # See dashboard
/bd ready              # Show work with no blockers
/bd work km-abc1       # Claim and start working on km-abc1
/bd show km-abc1       # View details without claiming
/bd close km-abc1      # Mark done
/bd sync               # Commit beads changes
/bd create --title="Fix bug" --type=bug --priority=2
```

## Execute

**Session-aware commands** (`work`, `claim`, `release`, `my`):
```bash
bun ./.claude/skills/bd/scripts/bd.ts $ARGUMENTS
```

**Standard commands** (`ready`, `show`, `close`, `sync`, `create`, `list`, etc.):
```bash
bd $ARGUMENTS
```

Most commands work directly with `bd`. Only use the script for session coordination.
