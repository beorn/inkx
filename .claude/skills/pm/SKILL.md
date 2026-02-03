---
description: Issue tracking with beads. Use when creating, claiming, closing issues or coordinating work across sessions.
argument-hint: [ready|review|work|do|show|close|sync|my|create|list] [id]
allowed-tools: Bash, Read, TodoWrite, Task, EnterPlanMode, AskUserQuestion
---

# Project Management

**Keywords**: bd, beads, issue, task, work, claim, bug, backlog

Issue tracking using beads. Coordinates work across Claude sessions.

**IMPORTANT**: Read [beads.md](beads.md) for full CLI reference before running commands.

**Directory**: Always run `bd` commands from the km root (`/Users/beorn/Code/pim/km`). If in a subdirectory (e.g., `vendor/*`), prefix commands with `cd /Users/beorn/Code/pim/km &&`.

**Submodule warning**: In `vendor/*` directories, beads use different prefixes (e.g., `beorn-inkx-*`). Always check with `bd list --limit 1` before creating.

## Current State

!`(cd /Users/beorn/Code/pim/km && bd list --status open --limit 10)`

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
| `/pm rebase`        | Load [workflows/rebase.md](workflows/rebase.md) for session reset | ask         |
| `/pm replan`        | Load [workflows/rebase.md](workflows/rebase.md) (alias)      | ask         |
| `/pm regroup`       | Load [workflows/rebase.md](workflows/rebase.md) (alias)      | ask         |
| `/pm new <id> "t"`  | `bd create --id <id> --title "t"` (check prefix: `bd list --limit 1`) | action      |
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

1. **Claim the bead**: `bd update <id> --claim` (sets assignee + status=in_progress)
2. **Get bead details**: `bd show <id>` to determine type
3. **Proceed DIRECTLY to implementation** - DO NOT ask "should I start work?"
4. **Load appropriate workflow** based on bead type:
   - Bug → [workflows/bugs.md](workflows/bugs.md)
   - Feature → [workflows/features.md](workflows/features.md)
   - Task → [workflows/tasks.md](workflows/tasks.md)

The user's command IS the confirmation. Never re-ask intent that was already expressed.

## Workflow

1. **Find work**: `bd ready` or `bd list`
2. **Claim work**: `bd update <id> --claim` - MANDATORY before coding
3. **Implement**: Do the work
4. **Complete**: `bd close <id> --reason "..."`
5. **Commit**: `git add .beads && git commit -m "chore: sync beads"`

## Quick Reference: Common Flag Mistakes

| Command     | Wrong    | Correct                                      |
| ----------- | -------- | -------------------------------------------- |
| `bd update` | `--desc` | `--description` or `-d`                      |
| `bd close`  | `--note` | `--reason` or `-r`                           |
| `bd create` | `--name` | `--title` or positional: `bd create <title>` |

**Note**: `--description` and `--notes` are both valid on `bd update` (different fields).

## Session Coordination

**Before creating new beads**: Check if similar issues were discussed before:
```bash
bun history "error handling"  # Search past sessions
bun history -q "TUI rendering bug"  # Find user questions about this
```

**Actor tracking** (automatic via session prehook):

- Claude sessions: `BD_ACTOR=claude:<sessionId>` (set by `.claude/settings.json` prehook)
- User shells: Uses `$USER` (e.g., "beorn")
- See [beads.md Actor Attribution](beads.md#actor-attribution-audit-trail) for details

**Claim management**:

| Action                   | Command                                      |
| ------------------------ | -------------------------------------------- |
| Claim (start work)       | `bd update <id> --claim`                     |
| Unclaim (return to pool) | `bd update <id> --assignee "" --status open` |
| Reassign                 | `bd update <id> --assignee "other-person"`   |
| View your claims         | `bd list --assignee $USER`                   |
| View all in-progress     | `bd list --status in_progress`               |
| Take over stale work     | `bd update <id> --claim` (forcibly reclaims) |

**Stale claim guidelines** (check: `bd show <id> --json | jq -r '.updated_at'`):

- **Agent claims** (`claude:*`): Stale after ~20 min, safe to reclaim
- **User claims** (`beorn`): Stale after ~24 hours, check before reclaiming

## Big Refactoring & Implementation Projects

When working on refactoring beads (labeled `refactor` or involving API migrations) or complex implementations:

1. **Read first**:
   - [/docs/principles.md](/docs/principles.md) - Architecture patterns, composability, fast feedback
   - [/docs/lessons/refactoring.md](/docs/lessons/refactoring.md) - Hard-won lessons on phase order, breaking vs fixing
2. **Rebase related beads** before starting - outdated beads cause accidental reverts
3. **Break intentionally** - delete old APIs, let `tsc` guide fixes
4. **Phase order**: Rebase -> Absorb -> Purge -> Remove -> Fix (not Fix -> Remove)

## Renaming / Re-IDing Beads

When renaming, re-creating, or changing a bead's ID, **always update all references**:

```bash
grep -r "km-old-id" .claude/ docs/ --include="*.md"
```

Check `.claude/skills/`, `docs/`, and other beads (parent/deps). Never leave dangling references.

## Package Prefixes

Beads use group prefixes for package families (configured in `alias_prefixes`):

| Prefix | Packages |
|--------|----------|
| `km-` | km (main project) |
| `inkx-` | inkx, chalkx, inkx-ui |
| `flexx-` | flexx layout engine |
| `beorn-tools-` | beorn-tools |
| `logger-` | logger |
| `tap-` | tap |
| `mdtest-` | mdtest |
| `watcher-` | watcher-chaos |

## Sub-Skills

| File                                           | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| [create.md](create.md)                         | Create bugs/features/tasks, optionally fix |
| [workflows/bugs.md](workflows/bugs.md)         | Bug fix workflow (reproduce, test, fix)    |
| [workflows/features.md](workflows/features.md) | Feature implementation (assess, plan, TDD) |
| [workflows/tasks.md](workflows/tasks.md)       | Task completion (refactoring, cleanup)     |
| [workflows/review.md](workflows/review.md)     | Backlog grooming (infrequent)              |
| [workflows/rebase.md](workflows/rebase.md)     | Session reset, context cleanup, planning   |
| [workflows/upstream.md](workflows/upstream.md) | External dependency bugs                   |
| [beads.md](beads.md)                           | Full CLI reference, all subcommands        |
| [beads-ids.md](beads-ids.md)                   | Bead ID conventions, scope tokens          |
| [labels.md](labels.md)                         | Label taxonomy and usage guidelines        |
