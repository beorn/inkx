# Automations

Event-driven rules that populate boards.

---

## Overview

Automations are rules that add/remove tasks from boards based on events. They're the only way tasks get onto boards — no magic queries.

**Philosophy:** Explicit over implicit. When something changes, you can see exactly which rules fired and why.

---

## Configuration

Automations live in `.km/auto/`:

```
.km/auto/
├── gtd.yml           # GTD workflow rules
├── references.yml    # Reference-based boards
└── custom.yml        # Your own rules
```

### Rule Structure

```yaml
# .km/auto/gtd.yml

name: GTD Workflow

setup:
  boards:
    - "@inbox"
    - "@next"
    - "@someday"
  folders:
    - inbox/
    - archive/

rules:
  - name: inbox-capture
    trigger: node.created
    where:
      path: starts_with "inbox/"
    actions:
      - board.add: "@inbox"
```

---

## Setup

Automation files declare required boards and folders:

```yaml
setup:
  boards:
    - "@inbox"
    - name: "@next"
      columns: [today, this-week, waiting]
    - "@someday"
  folders:
    - inbox/
    - archive/
```

### Column Status Automation

Columns can auto-set status via attributes in the markdown heading:

```markdown
# @next.md

## today
- ![[tasks/review-budget]]

## this-week
- ![[tasks/send-invoice]]

## waiting status:blocked
- ![[tasks/get-approval]]
```

Moving a task to `@next/waiting` automatically sets `status=blocked`.

### Running Setup

```bash
km auto setup              # Create missing boards/folders
km auto setup --dry-run    # Preview what would be created
```

Setup is idempotent — safe to run multiple times. Re-runs automatically when automation files change.

---

## Triggers

| Trigger | Fires When |
|---------|------------|
| `node.created` | New node created |
| `node.deleted` | Node deleted |
| `field.changed` | Any field changes |
| `field.cleared` | Field removed/cleared |
| `due.passed` | Due date is now in the past |
| `start.reached` | Start date is today or past |
| `daily` | Once per day (configurable) |
| `on_sync` | When `km sync` runs |

### Trigger Context

Triggers provide variables for conditions:

```yaml
- trigger: field.changed
  # Available: node, field, value, value.was
```

---

## Conditions (match)

Filter which nodes the rule applies to using [Node Query](km-query.md) syntax:

```yaml
match: "status:open"                    # Open tasks
match: "./inbox/**"                     # In inbox folder
match: "status:open due:past"           # Open AND overdue
match: "@bjorn status:open"             # Has @bjorn AND is open
match: "+website -status:done"          # Has +website AND not done
```

### Change Triggers

For `field.changed` triggers, use `was:` and `now:` to match transitions:

```yaml
- trigger: field.changed
  field: status
  was: "open"
  now: "blocked"
```

---

## Actions

| Action | Effect |
|--------|--------|
| `board.add: "@board"` | Add to board (default column) |
| `board.add: "@board/column"` | Add to specific column |
| `board.remove: "@board"` | Remove from board |
| `status.set: blocked` | Set task status |
| `archive` | Move to archive/ folder |

### Dynamic Values

Use `${}` for dynamic board names:

```yaml
actions:
  - board.add: "${ref}"               # Each reference
```

---

## GTD Workflow

Standard GTD rules:

```yaml
# .km/auto/gtd.yml

name: GTD Workflow

setup:
  boards:
    - "@inbox"
    - "@next"      # Columns defined in @next.md with status:blocked on waiting
    - "@someday"
  folders:
    - inbox/
    - archive/

rules:
  # === INBOX ===

  - name: inbox-capture
    description: Items in inbox/ folder appear on @inbox
    trigger: node.created
    match: "./inbox/**"
    actions:
      - board.add: "@inbox"

  - name: inbox-processed
    description: Remove from @inbox when moved out
    trigger: field.changed
    field: path
    was: "./inbox/**"
    now: "-./inbox/**"
    actions:
      - board.remove: "@inbox"

  # === NEXT ACTIONS ===

  - name: surface-overdue
    description: Overdue open tasks surface to @next
    trigger: due.passed
    match: "status:open"
    actions:
      - board.add: "@next"

  - name: surface-starting
    description: Tasks with start date reached surface to @next
    trigger: start.reached
    match: "status:open"
    actions:
      - board.add: "@next"

  # === COMPLETION ===

  - name: done-cleanup
    description: Completed tasks removed from active boards
    trigger: field.changed
    field: status
    now: "done|dropped"
    actions:
      - board.remove: "@next"
      - board.remove: "@inbox"
```

---

## Reference Boards

Tasks automatically appear on boards they reference:

```yaml
# .km/auto/references.yml

name: Reference Boards

rules:
  - name: person-boards
    description: Tasks with @person appear on that board
    trigger: field.changed
    field: references
    match: "@* -@inbox -@next -@someday"    # Skip system boards
    actions:
      - board.add: "${ref}"

  - name: project-boards
    description: Tasks with +project appear on that board
    trigger: field.changed
    field: references
    match: "+*"
    actions:
      - board.add: "${ref}"

  - name: tag-boards
    description: Tasks with #tag appear on that board
    trigger: field.changed
    field: references
    match: "#*"
    actions:
      - board.add: "${ref}"
```

---

## CLI

### Running Automations

```bash
km auto                    # Run pending automations
km auto --all              # Re-run all rules on all tasks
km auto <task-id>          # Run for specific task
```

### Preview / Dry Run

```bash
km auto --dry-run          # Preview all pending changes
km auto --dry-run <id>     # Preview for specific task
```

Output:
```
[dry-run] Task "Review budget" (01HXY...)
  + board.add @next/waiting    (rule: column-status)
  + status.set blocked         (rule: column-status)

1 task, 2 actions
```

### Debugging

```bash
km auto explain <task-id>  # Why is this task on these boards?
km auto log                # Recent automation activity
km auto log <task-id>      # History for specific task
```

Example `km auto explain`:
```
Task: "Get approval" (01HXY...)
status: blocked

On boards:
  @next/waiting     <- rule: column-status (in waiting column)
  @bjorn            <- rule: person-boards (has @bjorn ref)
```

### Managing Rules

```bash
km auto list               # List all rules
km auto show <rule>        # Show rule definition
km auto disable <rule>     # Disable a rule
km auto enable <rule>      # Re-enable
```

### Pause/Resume

```bash
km auto pause              # Pause all automations
km auto resume             # Resume (processes queue)
km auto status             # Show if paused/running
```

---

## Manual Override

Tasks can opt-out of automations:

```markdown
- [ ] Special task auto:ignore
- [ ] Another auto:ignore:inbox-capture
```

| Syntax | Effect |
|--------|--------|
| `auto:ignore` | Skip all automations |
| `auto:ignore:<rule>` | Skip specific rule |

---

## Execution Order

1. Rules execute in file order
2. Files execute alphabetically (use numeric prefixes)

```
.km/auto/
├── 00-core.yml       # First
├── 10-gtd.yml
└── 20-custom.yml     # Last
```

If multiple rules affect the same board, last one wins.

---

## Examples

### Archive Old Done

```yaml
- name: archive-old
  trigger: daily
  match: "status:done done_at:older_than_30d"
  actions:
    - archive
```

### Team Assignment

```yaml
- name: assign-to-board
  trigger: field.changed
  field: owner
  now: "*"                    # Any non-null value
  actions:
    - board.add: "@${owner}"
```

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-query.md](km-query.md) — Query language
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
