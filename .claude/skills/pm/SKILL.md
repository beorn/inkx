---
description: Issue tracking with beads
argument-hint: [ready|work|show|close|sync|my|create|list] [id]
allowed-tools: Bash, Read, TodoWrite
---

# Project Management

**Keywords**: bd, beads, issue, task, work, claim, bug, backlog

Issue tracking using beads. Coordinates work across Claude sessions.

**IMPORTANT**: Read [bd.md](bd.md) for full CLI reference before running commands.

## Current State

!`bun ./.claude/skills/pm/scripts/bd.ts 2>/dev/null || echo "Run /pm to see dashboard"`

## Command Mapping

When user says `/pm <action>`, run these `bd` commands:

| User Says          | Run This Command                                      |
| ------------------ | ----------------------------------------------------- |
| `/pm`              | `bd list --status open --limit 20`                    |
| `/pm ready`        | `bd ready`                                            |
| `/pm work <id>`    | `bd update <id> --claim --status in_progress`         |
| `/pm show <id>`    | `bd show <id>`                                        |
| `/pm close <id>`   | `bd close <id>`                                       |
| `/pm sync`         | `git add .beads && git commit -m "chore: sync beads"` |
| `/pm my`           | `bd list --assignee $(bd whoami)`                     |
| `/pm new <id> "t"` | `bd create --id km-<id> --title "t"`                  |
| `/pm create ...`   | See [bd.md](bd.md) for full create syntax             |

## Workflow

1. **Find work**: `bd ready` or `bd list`
2. **Claim work**: `bd update <id> --claim --status in_progress` - MANDATORY before coding
3. **Implement**: Do the work
4. **Complete**: `bd close <id>`
5. **Commit**: `git add .beads && git commit -m "chore: sync beads"`

## Session Coordination

- Claims expire after **30 minutes** of inactivity
- Stale claims can be taken over
- Use `bd list --assignee $(bd whoami)` to see your claims

## Sub-Skills

| File                               | Purpose                             |
| ---------------------------------- | ----------------------------------- |
| [bd.md](bd.md)                     | Full CLI reference, all subcommands |
| [naming.md](naming.md)             | Bead ID conventions, scope tokens   |
| [bugs.md](bugs.md)                 | Bug handling workflow               |
| [review-beads.md](review-beads.md) | Backlog grooming                    |
| [upstream-bug.md](upstream-bug.md) | External dependency bugs            |
