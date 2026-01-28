---
description: Issue tracking with beads. Use when creating, claiming, closing issues or coordinating work across sessions.
argument-hint: [ready|review|work|do|show|close|sync|my|create|list] [id]
allowed-tools: Bash, Read, TodoWrite, Task, EnterPlanMode, AskUserQuestion
---

# Project Management

**Keywords**: bd, beads, issue, task, work, claim, bug, backlog

Issue tracking using beads. Coordinates work across Claude sessions.

**IMPORTANT**: Read [beads.md](beads.md) for full CLI reference before running commands.

## Current State

!`bd list --status open --limit 10`

## Command Mapping

When user says `/pm <action>`, run these commands:

| User Says           | Action                                                       | Intent      |
| ------------------- | ------------------------------------------------------------ | ----------- |
| `/pm`               | `bd list --status open --limit 20`                           | info        |
| `/pm ready`         | `bd ready`                                                   | info        |
| `/pm review [mode]` | Load [workflows/review.md](workflows/review.md) for grooming | info        |
| `/pm bug <desc>`    | Load [create.md](create.md) for bug creation/fixing          | ask         |
| `/pm feat <desc>`   | Load [create.md](create.md) for feature creation             | ask         |
| `/pm task <desc>`   | Load [create.md](create.md) for task creation                | ask         |
| `/pm work <id>`     | Claim + start implementation immediately                     | **do-work** |
| `/pm do <id>`       | Claim + start implementation immediately                     | **do-work** |
| `/pm show <id>`     | `bd show <id>`                                               | info        |
| `/pm close <id>`    | `bd close <id>`                                              | action      |
| `/pm sync`          | `git add .beads && git commit -m "chore: sync beads"`        | action      |
| `/pm my`            | `bd list --assignee $USER`                                   | info        |
| `/pm new <id> "t"`  | `bd create --id km-<id> --title "t"`                         | action      |
| `/pm create ...`    | See [beads.md](beads.md) for full create syntax              | action      |

**Review modes**: `status` (health summary), `ready` (actionable work), `groom` (full review)

## Intent Handling

Commands have different intents that determine follow-up behavior:

| Intent      | Behavior                                                            |
| ----------- | ------------------------------------------------------------------- |
| **info**    | Display information only, no follow-up action                       |
| **ask**     | After action, ask user what to do next (e.g., "work now or track?") |
| **action**  | Execute action, report result, done                                 |
| **do-work** | **START WORK IMMEDIATELY** - no confirmation, proceed to implement  |

### do-work Intent (Critical)

When user says `/pm work <id>` or `/pm do <id>`:

1. **Claim the bead**: `bd update <id> --claim --status in_progress`
2. **Get bead details**: `bd show <id>` to determine type
3. **Proceed DIRECTLY to implementation** - DO NOT ask "should I start work?"
4. **Load appropriate workflow** based on bead type:
   - Bug → [workflows/bugs.md](workflows/bugs.md)
   - Feature → [workflows/features.md](workflows/features.md)
   - Task → [workflows/tasks.md](workflows/tasks.md)

The user's command IS the confirmation. Never re-ask intent that was already expressed.

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

## Big Refactoring Beads

When working on refactoring beads (labeled `refactor` or involving API migrations):

1. **Read first**: [/docs/lessons/refactoring.md](/docs/lessons/refactoring.md)
2. **Rebase related beads** before starting - outdated beads cause accidental reverts
3. **Break intentionally** - delete old APIs, let `tsc` guide fixes
4. **Phase order**: Rebase -> Absorb -> Purge -> Remove -> Fix (not Fix -> Remove)

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
