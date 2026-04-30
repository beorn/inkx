---
description: Issue tracking with beads. Use when creating, claiming, closing issues or coordinating work across sessions.
argument-hint: "[ready|review|work|do|show|close|sync|my|create|list] [id]"
allowed-tools: Bash, Read, TodoWrite, Task, EnterPlanMode, AskUserQuestion
benefits-from: [recall, gbrain]
---

# Project Management

**Keywords**: bd, beads, issue, task, work, claim, bug, backlog

Issue tracking using beads. Coordinates work across Claude sessions.

**IMPORTANT**: Read [beads.md](beads.md) for full CLI reference before running commands.

**Directory**: Always run `km bd` commands from the km root (`/Users/beorn/Code/pim/km`). If in a subdirectory (e.g., `vendor/*`), prefix commands with `cd /Users/beorn/Code/pim/km &&`.

**Submodule warning**: In `vendor/*` directories, beads use different prefixes (e.g., `silvery-*`). Always check with `km bd list --limit 1` before creating.

**`km bd` is the only implementation** (since 2026-04-29). The standalone Go `bd` binary and its Dolt backend (`.beads/beads.db`, `bd dolt push`) were retired. Bead state is now markdown under `@km/<scope>/<slug>.md`, ridden over normal git transport. Subcommands `ready / show / claim / update / close / create / list / query / dep / children / blocked / stale / orphans / migrate / export / remember / memories / prime / rename / config / info / where / comment / doctor / drop / agent` are all available on `km bd`. Older docs/sessions referring to `bd defer` / `bd count` / `bd epic` / `bd find-duplicates` / `bd graph` / `bd label` / `bd dolt` / `bd promote` / `bd mol` / `bd swarm` / `bd slot` / `bd gate` / `bd formula` / `bd backend` / `bd search` / `bd delete` / `bd comments` describe a binary that no longer exists. See [beads.md § Retired commands](beads.md#retired-commands) for what they mapped to.

## Current State

!`(cd /Users/beorn/Code/pim/km && km bd list --status open --limit 10)`

## Command Mapping

When user says `/pm <action>`, run these commands:

| User Says           | Action                                                       | Intent      |
| ------------------- | ------------------------------------------------------------ | ----------- |
| `/pm`               | `km bd list --status open --limit 20`                           | info        |
| `/pm ready`         | `km bd ready`                                                   | info        |
| `/pm review [mode]` | Load [workflows/review.md](workflows/review.md) for grooming | info        |
| `/pm bug <desc>`    | Load [create.md](create.md) for bug creation/fixing          | ask         |
| `/pm feat <desc>`   | Load [create.md](create.md) for feature creation             | ask         |
| `/pm task <desc>`   | Load [create.md](create.md) for task creation                | ask         |
| `/pm work <id>`     | Claim + start implementation immediately                     | **do-work** |
| `/pm do <id>`       | Claim + start implementation immediately                     | **do-work** |
| `/pm show <id>`     | `km bd show <id>`                                               | info        |
| `/pm verify <id>`   | Run executable acceptance criteria for a bead                | info        |
| `/pm close <id>`    | `km bd close <id>`                                              | action      |
| `/pm sync`          | `git add @km/ && git commit -m "chore: sync beads" && git push` | action      |
| `/pm my`            | `km bd list --assignee $USER`                                   | info        |
| `/pm refactor <scope>` | Load [workflows/refactor.md](workflows/refactor.md) for phased refactoring | ask    |
| `/pm retro <epic-id>` | Load [workflows/retrospective.md](workflows/retrospective.md) — closing a multi-bead epic | ask |
| `/pm rebase`        | Load [workflows/rebase.md](workflows/rebase.md) for session reset | ask         |
| `/pm replan`        | Load [workflows/rebase.md](workflows/rebase.md) (alias)      | ask         |
| `/pm regroup`       | Load [workflows/rebase.md](workflows/rebase.md) (alias)      | ask         |
| `/pm new <id> "t"`  | `km bd create "t" --id <id>` (check prefix: `km bd list --limit 1`) | action      |
| `/pm create ...`    | See [beads.md](beads.md) for full create syntax              | action      |
| `/pm session start <focus>` | Create session bead, print ID (see below)              | action      |
| `/pm session status` | Show current session bead's description                      | info        |
| `/pm session end`   | Close session bead with summary                              | action      |

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

1. **Claim the bead**: `km bd update <id> --claim` (sets assignee + status=wip)
2. **Get bead details**: `km bd show <id>` to determine type
3. **Recall context**: `bun recall "<bead-id>"` — the session that created a bead contains the richest context (problem analysis, discussion, reasoning). The bead ID appears in that `km bd create` call and in subsequent `km bd show`/`km bd update` calls, so searching by ID surfaces all sessions that touched it. Supplement with `bun recall "<keywords>"` for related work that didn't reference the bead. If recall reveals the work is already done or the approach was already tried, update/close the bead accordingly.
4. **Staleness check**: If bead is >1 week old and type is feature/task, verify requirements against current codebase before implementing. Update notes if verified. (Bugs: just verify repro still applies.)
5. **Proceed DIRECTLY to implementation** - DO NOT ask "should I start work?"
6. **Load appropriate workflow** based on bead type:
   - Bug → [workflows/bugs.md](workflows/bugs.md)
   - Feature → [workflows/features.md](workflows/features.md)
   - Task → [workflows/tasks.md](workflows/tasks.md)

The user's command IS the confirmation. Never re-ask intent that was already expressed.

## Scope Epics (Backlogs)

Every scoped bead should use path-form `@km/<scope>/<bead-name>` ids. Scope epics are `type=epic` and serve as backlogs — their children are the open work for that scope.

| Epic | Scope | Example |
|------|-------|---------|
| `@km/silvery` | silvery rendering engine | `@km/silvery/bg-bleed` |
| `@km/flexily` | Flexily layout engine | `@km/flexily/cold-start` |
| `@km/tui` | TUI app views/interaction | `@km/tui/emptybody` |
| `@km/vitestx` | Test framework package | `@km/vitestx/mdspec` |
| `@km/infra` | Monorepo infra (cross-cutting: CI, benchmarks, packaging) | `@km/infra/ci-fuzz` |
| `@km/storage` | Storage layer | `@km/storage/split-query` |
| `@km/tools` | km CLI tools & agent capabilities | `@km/tools/bd-api` |
| `@km/bearly` | bearly: reusable Claude Code tools (@bearly/*) | `@km/bearly/batch-refactor` |
| `@km/tribe` | Tribe coordination system | `@km/tribe/testing` |
| `@km/markdown` | Markdown parser/serializer | `@km/markdown/split-roundtrip` |
| `@km/review` | Code reviews (cross-cutting quality) | `@km/review/feb-0203` |

**Scoping rule**: If a bead belongs to a specific package, use `km-<package>`. If cross-cutting infra (CI, benchmarks, packaging), use `km-infra`. If cross-cutting non-infra (code reviews, multi-package quality), use `km-review`.

**Creating**: Prefer path-form IDs such as `@km/<scope>/<suffix>` so the bead lands under the scope at creation time.
**Closing**: The parent-child link is preserved on closed beads automatically.

### Two Kinds of Epics

| Kind | Examples | Closes? | Meaning of 98% |
|------|----------|---------|-----------------|
| **Scope epic** (backlog) | `km-tui`, `km-silvery`, `km-infra` | **Never** — permanent backlog | "Only a few open items left" |
| **Project epic** (finite) | `@km/silvery/era2`, `@km/silvery/tea` | **Yes** — when all children done | "Project complete" |

**Scope epics are backlogs.** New bugs/features keep getting added. Don't close them even at 98%. Auto-close logic is gone (the old `bd epic close-eligible` was retired); project epics close manually via `km bd close` after verifying all children are done.

### Managing Epics

```bash
km bd children <epic-id>              # List children
km bd list --parent <epic-id>         # Alternative
km bd query "parent=<epic-id> AND status!=done" --json | jq length   # Open child count

# Project-epic completion: confirm all children closed, then close manually
km bd children <epic-id> --json | jq -r '.[] | "\(.id) \(.status)"'
km bd close <epic-id> --reason "All children done — see <retro-doc-path>"
```

No need for `TRACKING:` or `(idle)` title prefixes — `type=epic` carries that information.

## Session Tracking

Session beads record what happened during a work session (especially `/explore` or batch bug-fixing). They provide persistent, queryable records with incremental updates.

### `/pm session start <focus>`

```bash
# Generate date-based ID: @km/session/<MMDD><seq> (a, b, c for multiple same-day sessions)
km bd create "Session: <focus>" --type task --priority P2 --id @km/session/0215a
km bd update @km/session/0215a --claim
```

Print the session bead ID. This ID is used for all subsequent session updates.

### `/pm session status`

```bash
km bd show <current-session-id>
```

Shows the session bead's description (status dashboard) and notes (event log).

### `/pm session end`

```bash
# Update description with final dashboard
km bd update <session-id> --description "<final dashboard>"
# Close with summary
km bd close <session-id> --reason "Explored <focus>. Found N bugs (M fixed). N tests, M screenshots."
```

### Linking Bugs to Sessions

When creating a bug during a session, log it in the session bead:

```bash
km bd update <session-id> --notes "HH:MM — Found bug: <desc> → created <bead-id> (P2)"
```

When closing a bug found during a session, reference the session:

```bash
km bd close <bug-id> --reason "Fixed: ... Session: <session-id>"
```

## Staleness Check

Beads older than **1 week** are suspect — requirements may have drifted. Before working on a stale bead:

1. **Bugs**: Usually still valid (the bug still exists). Quick-verify the repro still applies.
2. **Features/tasks**: Re-check whether the requirements still match current state. Code may have changed, priorities may have shifted, or the feature may have been partially implemented.
3. **If still relevant**: Update the bead with a note confirming it's current:
   ```bash
   km bd update <id> --notes "Verified 2026-02-04: requirements still current. <any updates>"
   ```
   This resets the staleness clock — another 1-2 weeks can pass before re-verification.
4. **If requirements changed**: Update the description, then proceed.
5. **If no longer relevant**: Close with reason.

## Workflow

1. **Find work**: `km bd ready` or `km bd list`
2. **Claim work**: `km bd update <id> --claim` - MANDATORY before coding
3. **Recall context**: `bun recall "<bead-id>"` — the creating session has the richest context. Also try keywords if ID results are sparse.
4. **Staleness check**: If bead is >1 week old, verify requirements (see above)
5. **Implement**: Do the work
6. **Complete**: `km bd close <id> --reason "..."`
7. **Commit**: `git add @km/ && git commit -m "chore: sync beads"`

## Acceptance Bullet Rule

Every Acceptance bullet on a new bead must name a current consumer or workflow ("X consumed by Y to do Z"), not just "X exists". If you cannot name a consumer, the work is speculative — file it in [hub/futures.md](../../../hub/futures.md) instead, or use the `scaffold:` title prefix with an explicit deferred-consumer caveat. Full rationale and examples in [create.md](create.md#phase-3-bead-management).

## Quick Reference: Common Flag Mistakes

**Bead commands take the path positionally.** `update / close / show / claim / drop / children / blocked / comment / dep` accept the path-form id as a positional argument — no flag needed:

```bash
km bd update @km/tui/normal-mode-nav --status wip
km bd close  @km/tui/normal-mode-nav --reason "shipped at <SHA>"
km bd show   @km/tui/normal-mode-nav
km bd children @km/silvery
```

**`bd create` still uses `--id`** today; positional path on `create` is tracked under `@km/beads/name-is-identity` (CLI portion). Until that lands, write the path-form id explicitly with `--id` and **do not** pass `--parent` (path encodes parent):

```bash
km bd create "Foo" --type task --priority P2 --id @km/tui/foo
```

| Command     | Wrong                         | Correct                                      |
| ----------- | ----------------------------- | -------------------------------------------- |
| `km bd create` | `--parent km-tui --id foo`    | `km bd create "Foo" --id @km/tui/foo`       |
| `km bd update` | `--id @km/tui/foo --status wip` | `km bd update @km/tui/foo --status wip`    |
| `km bd update` | `--desc`                      | `--description` or `-d`                      |
| `km bd close`  | `--note`                      | `--reason` or `-r`                           |
| `km bd create` | `--name`                      | `--title` or positional: `km bd create <title>` |

**Note**: `--description` and `--notes` are both valid on `km bd update` (different fields).

## Session Coordination

**Before creating new beads**: Check `bun recall "topic"` for similar past issues.

**Actor tracking**: Automatic via session prehook (`BD_ACTOR=claude:<sessionId>`). See [beads.md](beads.md#actor-attribution-audit-trail).

**Claims**: `km bd update <id> --claim` to start, `km bd update <id> --assignee "" --status open` to release. Agent claims stale after ~20 min, user claims after ~24h.

**Refactoring beads**: Read [/docs/principles.md](/docs/principles.md) and [/docs/lessons/refactoring.md](/docs/lessons/refactoring.md) first. Phase order: Rebase -> Absorb -> Purge -> Remove -> Fix.

**Renaming beads**: Use `km bd rename <old-id> <new-id>` — automatically updates all references (deps, descriptions, titles, notes, labels, comments, events).

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
| [verify.md](verify.md)                         | Run executable acceptance criteria for a bead (`bd-verify`) |
| [beads.md](beads.md)                           | Full CLI reference, all subcommands        |
| [beads-ids.md](beads-ids.md)                   | Bead ID conventions, scope tokens          |
| [labels.md](labels.md)                         | Label taxonomy and usage guidelines        |
