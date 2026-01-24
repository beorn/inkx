---
description: Beads issue tracker. Use when user asks "what should I work on?", "show available tasks", "claim this issue", "find work", or wants to coordinate work between sessions.
argument-hint: [ready|show|work|claim|release|close|sync|my] [id]
allowed-tools: Bash, Read
disable-model-invocation: true
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

## Examples

```bash
/bd                    # See dashboard
/bd ready              # Show work with no blockers
/bd work km-abc1       # Claim and start working on km-abc1
/bd show km-abc1       # View details without claiming
/bd close km-abc1      # Mark done
/bd sync               # Commit beads changes
```

## Usage

```bash
bun ./.claude/skills/bd/scripts/bd.ts $ARGUMENTS
```
