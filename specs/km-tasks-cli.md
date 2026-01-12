# Tasks CLI

Command-line interface for task management.

---

## Commands Overview

| Command | Purpose |
|---------|---------|
| `km task` | List and filter tasks |
| `km @board` | View/manage `@` board |
| `km +board` | View/manage `+` board |
| `km #board` | View/manage `#` board |
| `km add` | Quick capture |
| `km done` | Mark task done |
| `km move` | Re-parent task |
| `km auto` | Manage automations |
| `km import` | Import TextBundle |
| `km export` | Export TextBundle |

**Note:** Board commands require the sigil prefix (`@`, `+`, `#`) to distinguish from subcommands.

---

## km task

List and filter tasks.

### Basic Usage

```bash
km task                     # Open tasks (open, wip)
km task --all               # All tasks including done
km task "query"             # Search tasks
```

### Filters

```bash
km task --status <status>   # Filter by status (open, wip, done, dropped)
km task --status wip        # In progress tasks

km task --overdue           # Overdue tasks
km task --due today         # Due today
km task --due week          # Due this week

km task --project "Work"    # Tasks in project
km task --owner bjorn       # Assigned to user
km task --ref @bjorn        # Tasks referencing @bjorn
km task --ref "#finance"    # Tasks referencing #finance

km task --waiting           # Tasks with waiting: field
km task --waiting @sarah    # Waiting on Sarah
km task --blocked           # Tasks with blocked: field

km task --inbox             # Items in inbox/ folder
```

### Output Options

```bash
km task --verbose           # Show all fields
km task --flat              # Single-line format
km task --id                # Show task IDs
km task --json              # JSON output
```

### Examples

```bash
km task --overdue --verbose
km task --project "Work/Q1" --status open
km task "budget" --due week
km task --waiting @sarah    # What's Sarah got?
```

---

## Board Commands

View and manage boards. Sigil (`@`, `+`, `#`) required.

### View Boards

```bash
km @next                    # View @next board
km @inbox                   # View @inbox board
km @waiting                 # View all waiting items
km @waiting/@sarah          # Waiting on Sarah specifically
km @someday                 # View someday board
km @bjorn                   # View person board
km @phone                   # View context board
km +website                 # View project board
km '#finance'               # View tag board (quote in shell)
```

### Board Operations

```bash
km @next add <id>           # Add task to board (default column)
km @next add <id> today     # Add to specific column
km @next remove <id>        # Remove task from board
km @next move <id> <col>    # Move to different column
km @next list               # List all tasks on board
```

### Inbox Processing

```bash
km @inbox                   # Show inbox items
km @inbox process           # Interactive processing
```

Interactive processing walks through each item:

```
Inbox item 1 of 5:
"Call from John about project"

[n] @next  [p] Project  [s] Someday  [d] Done  [D] Delete
>
```

### Examples

```bash
km @next                    # View next actions
km @next add 01HXY...       # Add task to @next
km @next add "call" today   # Add by search, to "today" column
km @bjorn add 01HXY... to-discuss  # Add to person board
km +website move 01HXY... done     # Move to done column
km @waiting/@sarah          # What's Sarah owe me?
```

---

## km add

Quick capture - create new task.

### Usage

```bash
km add "Task title"                    # Add to inbox
km add -n "Task title"                 # Add to @next
km add -p "Project" "Task title"       # Add to project
km add "Task @bjorn due:2025-01-15"    # With metadata
km add "Get sign-off waiting:@sarah"   # Waiting task
```

### Options

| Option | Description |
|--------|-------------|
| `-n, --next` | Add to @next board |
| `-p, --project` | Set parent project |
| `-d, --due` | Set due date |
| `-s, --start` | Set start/scheduled date |
| `-o, --owner` | Assign to user |
| `-w, --waiting` | Set waiting on who/what |
| `-P, --priority` | Set priority (1-5) |

### Examples

```bash
km add "Call dentist"
km add -n "Review PR #42"
km add -p "Work/Q1" "Budget review" -d 2025-01-15
km add "Get approval" -w @sarah
km add "Weekly review" --recur "FREQ=WEEKLY;BYDAY=MO"
```

---

## km done

Mark task done.

### Usage

```bash
km done <id>                # Mark done by ID
km done "query"             # Mark done by search
km done --last              # Mark last touched task done
```

### Behavior

- Sets `status = done`
- Clears `waiting:` and `blocked:` fields
- For recurring tasks: clones with next occurrence
- Removes from active boards (@next, @waiting, etc.)

### Examples

```bash
km done 01HXY...            # By ID
km done "call dentist"      # By search
km done --last              # Last task
```

---

## km move

Re-parent task to different project.

### Usage

```bash
km move <id> <parent-id>         # Move by IDs
km move <id> --project "Name"    # Move by project name
km move <id> --root              # Move to root level
```

### Examples

```bash
km move 01HXY... 01HXZ...        # Move to parent
km move "call" --project "Personal/Health"
km move 01HXY... --root          # Unparent
```

---

## km import

Import from TextBundle format.

### Usage

```bash
km import <path>                  # Import file or directory
km import file.textbundle         # Single TextBundle
km import file.textpack           # Compressed TextPack
km import ~/Bear/                 # Batch import directory
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without importing |
| `--project` | Set parent for imported items |
| `--assets` | Asset handling (cas/alongside) |

---

## km export

Export to TextBundle format.

### Usage

```bash
km export <id> -o <path>          # Export single node
km export --all -o <path>         # Export everything
km export --project "Name" -o <path>  # Export project
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output` | Output path (required) |
| `--textbundle` | Export as .textbundle (default) |
| `--textpack` | Export as .textpack (compressed) |
| `--include-done` | Include completed tasks |

---

## Status Shortcuts

Quick status changes:

```bash
km task status <id> <status>      # Set status
km task claim <id>                # Set wip, assign to me
km task release <id>              # Set open, unassign
km task wait <id> @person         # Set waiting: field
km task block <id> "reason"       # Set blocked: field
km task unblock <id>              # Clear blocked: field
km task start <id> <date>         # Set start date
```

### Examples

```bash
km task claim 01HXY...
km task wait 01HXY... @sarah
km task block 01HXY... "Waiting for API migration"
km task unblock 01HXY...
```

---

## Output Formats

### Default (Tree)

```
Work / Finance
  [ ] Review Q1 budget          due:Jan 15
  [.] Send invoice              @bjorn

Personal / Health
  [ ] Call dentist              due:today
  [ ] ↻ Weekly review           Mon
```

Recurring tasks show `↻` indicator.

### Flat (`--flat`)

```
[ ] Review Q1 budget    Work/Finance    due:Jan15
[.] Send invoice        Work/Finance    @bjorn
[ ] Call dentist        Personal        due:today
[ ] ↻ Weekly review     Personal        Mon
```

### JSON (`--json`)

```json
[
  {
    "id": "01HXY...",
    "content": "Review Q1 budget",
    "status": "open",
    "due": "2025-01-15",
    "owner": "bjorn",
    "references": ["@bjorn", "#finance", "+q1"],
    "ancestors": ["Work", "Finance"]
  },
  {
    "id": "01HXZ...",
    "content": "Get approval",
    "status": "open",
    "waiting": "@sarah",
    "ancestors": ["Work"]
  }
]
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KM_DIR` | Override .km directory |
| `KM_USER` | Default user for assignment |
| `KM_ROOT` | Default root directory |

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
