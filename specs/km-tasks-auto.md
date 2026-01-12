# Automations

Event-driven rules that move tasks between boards and update state.

---

## Setup

Automation files can declare required nodes that must exist:

```yaml
# .km/auto/gtd.yml

name: GTD Workflow
description: Getting Things Done automation rules

setup:
  boards:
    - name: "@inbox"
      columns: [new, processing]
    - name: "@next"
      columns: [today, this-week]
    - name: "@waiting"
      columns: [pending]
    - name: "@someday"
      columns: [ideas, maybe]
    - name: "@blocked"
      columns: [blocked]

  folders:
    - inbox/
    - archive/

rules:
  # ... rules here
```

### Running Setup

```bash
km auto setup              # Create missing boards/folders
km auto setup --dry-run    # Preview what would be created
km auto setup gtd          # Setup specific automation file
```

Setup is idempotent - running it multiple times is safe. It only creates missing items.

### Init on First Run

When `km init` creates a new vault, it runs `km auto setup` automatically if automation files exist.

---

## Overview

Automations are rules that run in response to events. They replace "query boards" with explicit, understandable actions.

**Philosophy**: No magic. When a task changes, automations explicitly move it to the right boards. You can see exactly what will happen.

---

## Configuration

Automations live in `.km/auto/`:

```
.km/auto/
├── gtd.yml           # GTD workflow rules
├── team.yml          # Team collaboration rules
└── custom.yml        # Your own rules
```

### Rule Structure

```yaml
# .km/auto/gtd.yml

name: GTD Workflow
description: Standard GTD automation rules

rules:
  - name: inbox-capture
    description: New items in inbox/ appear on @inbox board
    trigger: node.created
    where:
      path: starts_with "inbox/"
    actions:
      - board.add: "@inbox"

  - name: surface-overdue
    description: Overdue tasks appear on @next
    trigger: due.passed
    where:
      status: open
    actions:
      - board.add: "@next"
```

---

## Triggers

| Trigger | Fires When |
|---------|------------|
| `node.created` | New node created |
| `node.deleted` | Node deleted |
| `status.changed` | Task status changes |
| `due.passed` | Due date is now in the past |
| `start.reached` | Start date is today or past |
| `field.changed` | Any field changes |
| `daily` | Once per day (morning) |
| `on_sync` | When `km sync` runs |

### Trigger Context

Triggers provide context variables:

```yaml
- trigger: status.changed
  # Available in where/actions:
  # - node: the task
  # - status: new status
  # - status.was: previous status
```

---

## Conditions (where)

Filter which nodes the rule applies to:

```yaml
where:
  status: open                    # Exact match
  status: [open, wip]             # Any of
  path: starts_with "inbox/"      # String match
  due: past                       # Date comparison
  due: today
  due: future
  start: today_or_past
  has_ref: "@bjorn"               # Has reference
  on_board: "@next"               # Currently on board
```

### Previous Values

For change triggers, access previous values:

```yaml
- trigger: status.changed
  where:
    status: done
    status.was: [open, wip]       # Was open or wip, now done
```

---

## Actions

| Action | Effect |
|--------|--------|
| `board.add: "@board"` | Add task to board (default column) |
| `board.add: "@board/column"` | Add to specific column |
| `board.remove: "@board"` | Remove from board |
| `board.move: "@board/column"` | Move to column (must be on board) |
| `set.status: done` | Set task status |
| `set.field: value` | Set any field |
| `archive` | Move to archive/ folder |

### Multiple Actions

```yaml
actions:
  - board.remove: "@next"
  - board.remove: "@waiting"
  - board.add: "@done"
```

---

## GTD Workflow

Standard GTD automations:

```yaml
# .km/auto/gtd.yml

name: GTD Workflow
description: Getting Things Done automation rules

setup:
  boards:
    - name: "@inbox"
      description: Unprocessed items
      columns: [new]
    - name: "@next"
      description: Next actions
      columns: [today, this-week]
    - name: "@waiting"
      description: Waiting for external
      columns: [pending]
    - name: "@someday"
      description: Maybe/later ideas
      columns: [ideas]
    - name: "@blocked"
      description: Blocked by internal
      columns: [blocked]
  folders:
    - inbox/
    - archive/

rules:
  # === INBOX ===

  - name: inbox-capture
    description: Items created in inbox/ appear on @inbox board
    trigger: node.created
    where:
      path: starts_with "inbox/"
    actions:
      - board.add: "@inbox"

  - name: inbox-processed
    description: Remove from @inbox when moved out of inbox/
    trigger: field.changed
    where:
      path.was: starts_with "inbox/"
      path: not_starts_with "inbox/"
    actions:
      - board.remove: "@inbox"

  # === NEXT ACTIONS ===

  - name: surface-overdue
    description: Overdue open tasks surface to @next
    trigger: due.passed
    where:
      status: open
    actions:
      - board.add: "@next"

  - name: surface-starting
    description: Tasks with start date reached surface to @next
    trigger: start.reached
    where:
      status: open
    actions:
      - board.add: "@next"

  # === WAITING ===

  - name: waiting-add
    description: Tasks set to waiting go to @waiting board
    trigger: status.changed
    where:
      status: waiting
    actions:
      - board.add: "@waiting"

  - name: waiting-remove
    description: Tasks no longer waiting leave @waiting board
    trigger: status.changed
    where:
      status.was: waiting
      status: not waiting
    actions:
      - board.remove: "@waiting"

  # === SOMEDAY ===

  - name: someday-add
    description: Tasks set to someday go to @someday board
    trigger: status.changed
    where:
      status: someday
    actions:
      - board.add: "@someday"

  - name: someday-remove
    description: Tasks no longer someday leave @someday board
    trigger: status.changed
    where:
      status.was: someday
      status: not someday
    actions:
      - board.remove: "@someday"

  # === COMPLETION ===

  - name: done-cleanup
    description: Completed tasks removed from active boards
    trigger: status.changed
    where:
      status: [done, dropped]
    actions:
      - board.remove: "@next"
      - board.remove: "@waiting"
      - board.remove: "@inbox"
      - board.remove: "@someday"

  # === BLOCKED ===

  - name: blocked-add
    trigger: status.changed
    where:
      status: blocked
    actions:
      - board.add: "@blocked"

  - name: blocked-remove
    trigger: status.changed
    where:
      status.was: blocked
      status: not blocked
    actions:
      - board.remove: "@blocked"
```

---

## Reference Boards

Tasks with references auto-appear on those boards:

```yaml
# .km/auto/references.yml

name: Reference Boards
description: Tasks appear on boards they reference

rules:
  - name: person-board
    description: Tasks with @person appear on that person's board
    trigger: field.changed
    where:
      has_ref: starts_with "@"
    actions:
      - board.add: "${ref}"    # Dynamic: adds to each @ref board

  - name: project-board
    description: Tasks with +project appear on that project's board
    trigger: field.changed
    where:
      has_ref: starts_with "+"
    actions:
      - board.add: "${ref}"

  - name: tag-board
    description: Tasks with #tag appear on that tag's board
    trigger: field.changed
    where:
      has_ref: starts_with "#"
    actions:
      - board.add: "${ref}"
```

---

## Execution

### When Rules Run

1. **On change**: Immediately after task modification
2. **On sync**: When `km sync` runs
3. **Daily**: Once per day (configurable time)

### Order

Rules execute in file order, then alphabetical by filename. Use numeric prefixes to control order:

```
.km/auto/
├── 00-core.yml       # Runs first
├── 10-gtd.yml
└── 20-custom.yml     # Runs last
```

### Conflicts

If multiple rules try to add/remove from same board, last one wins. Use rule ordering to control.

### Dry Run

```bash
km auto --dry-run          # Show what would happen
km auto --dry-run <id>     # For specific task
```

---

## CLI

### Running Automations

```bash
km auto                    # Run all pending automations
km auto --all              # Re-run all rules on all tasks
km auto <task-id>          # Run automations for specific task
```

### Dry Run / Preview

```bash
km auto --dry-run          # Preview all pending changes
km auto --dry-run <id>     # Preview for specific task
km auto --dry-run --all    # Preview full re-run
```

Dry run output:
```
[dry-run] Task "Review budget" (01HXY...)
  + board.add @next         (rule: surface-overdue)

[dry-run] Task "Call vendor" (01HXZ...)
  + board.add @waiting      (rule: waiting-add)
  - board.remove @next      (rule: waiting-add)

2 tasks would be affected, 3 actions
```

### Managing Rules

```bash
km auto list               # List all rules with status
km auto list --verbose     # Show full rule definitions
km auto show <rule-name>   # Show single rule details

km auto disable <name>     # Disable a rule
km auto enable <name>      # Re-enable a rule
km auto disable gtd:*      # Disable all rules in gtd.yml
```

### Debugging

```bash
km auto log                # Show recent automation activity
km auto log --tail         # Follow log in real-time
km auto log <task-id>      # Show automation history for task

km auto explain <task-id>  # Show why task is on each board
km auto test <rule-name>   # Test rule against all tasks (dry-run)
```

Example `km auto explain`:
```
Task: "Review budget" (01HXY...)
Status: open
Due: 2025-01-10 (overdue)

On boards:
  @next/today     <- rule: surface-overdue (due.passed)
  @bjorn/discuss  <- reference: @bjorn in task
  +q1/backlog     <- reference: +q1 in task

Would be added by:
  (none - all applicable rules already applied)

Would be removed by:
  (none)
```

### Pausing Automations

```bash
km auto pause              # Pause all automations
km auto resume             # Resume automations
km auto status             # Show if paused/running
```

When paused, changes queue up. Resume processes the queue.

### Manual Override

Tasks can opt-out of specific automations:

```markdown
- [ ] Special task @bjorn auto:ignore
- [ ] Another task auto:ignore:surface-overdue
```

| Syntax | Effect |
|--------|--------|
| `auto:ignore` | Skip all automations for this task |
| `auto:ignore:<rule>` | Skip specific rule |
| `auto:only:<rule>` | Only run specific rule |

---

## Examples

### Team Workflow

```yaml
# .km/auto/team.yml

rules:
  - name: assign-to-board
    description: Assigned tasks appear on assignee's board
    trigger: field.changed
    where:
      field: owner
    actions:
      - board.add: "@${owner}"

  - name: review-needed
    description: Tasks in review status go to @review
    trigger: status.changed
    where:
      status: waiting
      waiting_for: "review"
    actions:
      - board.add: "@review"
```

### Archive Old Done

```yaml
- name: archive-old
  description: Archive tasks done more than 30 days ago
  trigger: daily
  where:
    status: done
    done_at: older_than "30d"
  actions:
    - archive
```

---

## See Also

- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks.md](km-tasks.md) — Overview
