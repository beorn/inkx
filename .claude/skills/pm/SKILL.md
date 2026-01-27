---
description: Issue tracking with beads. Use when creating, claiming, closing issues or coordinating work across sessions.
argument-hint: [ready|work|do|show|close|sync|my|create|list] [id]
allowed-tools: Bash, Read, TodoWrite
---

# Project Management

**Keywords**: bd, beads, issue, task, work, claim, bug, backlog

Issue tracking using beads. Coordinates work across Claude sessions.

**IMPORTANT**: Read [beads.md](beads.md) for full CLI reference before running commands.

## Current State

!`bd list --status open --limit 10`

## Command Mapping

When user says `/pm <action>`, run these commands:

| User Says          | Action                                                |
| ------------------ | ----------------------------------------------------- |
| `/pm`              | `bd list --status open --limit 20`                    |
| `/pm ready`        | `bd ready`                                            |
| `/pm bug <desc>`   | Load [create.md](create.md) for bug creation/fixing   |
| `/pm feat <desc>`  | Load [create.md](create.md) for feature creation      |
| `/pm task <desc>`  | Load [create.md](create.md) for task creation         |
| `/pm work <id>`    | `bd update <id> --claim --status in_progress`         |
| `/pm do <id>`      | `bd update <id> --claim --status in_progress`         |
| `/pm show <id>`    | `bd show <id>`                                        |
| `/pm close <id>`   | `bd close <id>`                                       |
| `/pm sync`         | `git add .beads && git commit -m "chore: sync beads"` |
| `/pm my`           | `bd list --assignee $USER`                            |
| `/pm new <id> "t"` | `bd create --id km-<id> --title "t"`                  |
| `/pm create ...`   | See [beads.md](beads.md) for full create syntax       |

## Workflow

1. **Find work**: `bd ready` or `bd list`
2. **Claim work**: `bd update <id> --claim --status in_progress` - MANDATORY before coding
3. **Implement**: Do the work
4. **Complete**: `bd close <id>`
5. **Commit**: `git add .beads && git commit -m "chore: sync beads"`

## Session Coordination

**Actor tracking** (automatic):

- Each Claude session has unique actor ID: `claude:abc12345` (from $BD_ACTOR)
- User operations use actor: `beorn` (from $USER)
- See [beads.md Actor Attribution](beads.md#actor-attribution-audit-trail) for details

**Claim management** (manual):

- Claims don't auto-expire - use `bd list --status in_progress` to see active work
- **Stale claim guidelines** (check age with `bd show <id> --json | jq -r '.[0].updated_at'`):
  - **Agent claims** (actor=`claude:*`): Stale after **20 minutes** of inactivity, safe to reclaim
  - **User claims** (actor=`beorn`): Stale after **24 hours** of inactivity, check before reclaiming
- Take over stale work: `bd update <id> --claim` (forcibly claims, updates assignee)
- View your claims: `bd list --assignee $USER`
- Actor field shows who last worked on each bead (audit trail)

## Sub-Skills

| File                                           | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| [create.md](create.md)                         | Create bugs/features/tasks, optionally fix |
| [workflows/bugs.md](workflows/bugs.md)         | Bug fix workflow (reproduce, test, fix)    |
| [workflows/features.md](workflows/features.md) | Feature implementation (assess, plan, TDD) |
| [workflows/tasks.md](workflows/tasks.md)       | Task completion (refactoring, cleanup)     |
| [workflows/review.md](workflows/review.md)     | Backlog grooming (infrequent)              |
| [workflows/upstream.md](workflows/upstream.md) | External dependency bugs                   |
| [beads.md](beads.md)                           | Full CLI reference, all subcommands        |
| [beads-ids.md](beads-ids.md)                   | Bead ID conventions, scope tokens          |
| [labels.md](labels.md)                         | Label taxonomy and usage guidelines        |
