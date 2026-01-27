---
description: Issue tracking with beads
argument-hint: [ready|work|show|close|sync|my|create|list] [id]
allowed-tools: Bash, Read, TodoWrite
---

# Project Management

**Keywords**: bd, beads, issue, task, work, claim, bug, backlog

Issue tracking using beads. Coordinates work across Claude sessions.

## Current State

!`bun ./.claude/skills/pm/scripts/bd.ts 2>/dev/null || echo "Run /pm to see dashboard"`

## Workflow

1. **Find work**: `/pm` or `/pm ready`
2. **Claim work**: `/pm work <id>` - MANDATORY before coding
3. **Implement**: Do the work
4. **Complete**: `/pm close <id>`
5. **Commit**: `/pm sync`

## Quick Commands

| Command          | Action               |
| ---------------- | -------------------- |
| `/pm`            | Dashboard            |
| `/pm ready`      | Actionable work      |
| `/pm work <id>`  | Claim + start        |
| `/pm show <id>`  | View details         |
| `/pm close <id>` | Complete work        |
| `/pm sync`       | Commit beads changes |
| `/pm my`         | Your active claims   |

## Session Coordination

- Claims expire after **30 minutes** of inactivity
- Stale claims can be taken over
- Use `/pm my` to see your claims

## Sub-Skills

| File                   | Purpose                             |
| ---------------------- | ----------------------------------- |
| [bd.md](bd.md)         | Full CLI reference, all subcommands |
| [naming.md](naming.md) | Bead ID conventions, scope tokens   |
| [bugs.md](bugs.md)     | Bug handling workflow               |
