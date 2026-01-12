# Tasks CLI

Command-line interface for task management.

---

## Commands Overview

| Command | Purpose |
|---------|---------|
| `km task` | List, filter, query tasks |
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

List, filter, and query tasks.

### Basic Usage

```bash
km task                     # Open tasks
km task --all               # All tasks including done
km task "budget"            # Full-text search
```

### Query Syntax

Google-like search with filters:

```bash
km task budget                         # Full-text search
km task @bjorn                         # Has @bjorn reference
km task +website                       # Has +website reference
km task '#finance'                     # Has #finance reference

km task @next                          # On @next board
km task -@next                         # NOT on @next board
km task @waiting/@sarah                # On @waiting/@sarah board

km task status:open                    # By status
km task due:today                      # Due today
km task due:past                       # Overdue
km task due:week                       # Due within 7 days
km task waiting:@sarah                 # Waiting on Sarah
km task owner:bjorn                    # Owned by bjorn

km task inbox/                         # In inbox/ folder
km task projects/website/              # In project folder
km task projects/**                    # Recursive glob
```

### Combining Filters

```bash
km task status:open due:week           # Open + due this week
km task +website -@next                # Project tasks not on @next
km task budget owner:bjorn             # Search + filter
km task status:open -@next -@someday   # Not scheduled anywhere
```

### Output Options

```bash
km task --verbose           # Show all fields
km task --flat              # Single-line format
km task --id                # Show task IDs
km task --json              # JSON output
km task --count             # Count only
```

### Examples

```bash
km task due:past --verbose             # Overdue tasks, full detail
km task +website status:open           # Open website tasks
km task @waiting owner:bjorn           # My waiting items
km task @blocked                       # All blocked tasks
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
km @blocked                 # View blocked board
km @bjorn                   # View person board
km +website                 # View project board
km '#finance'               # View tag board (quote in shell)
```

### Adding to Boards

```bash
# Add single task
km @next add <id>
km @next add <id> --column today

# Add by query
km @next add --query "status:open due:today"
km @next add --query "+website status:open"
km @next add --query "status:open p:1" --column today

# Add by path/glob
km @next add --query "projects/website/**"

# Add multiple specific tasks
km @next add task-1 task-2 task-3

# Preview first
km @next add --query "due:week" --dry-run
```

### Removing from Boards

```bash
km @next remove <id>
km @next remove --query "status:done"
```

### Moving Between Columns

```bash
km @next move <id> <column>
km @next move <id> this-week
```

### Listing Board Contents

```bash
km @next list               # List all tasks on board
km @next list --column today  # Just one column
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
| `-b, --blocked` | Set blocked by what |
| `-P, --priority` | Set priority (1-5) |

### Examples

```bash
km add "Call dentist"
km add -n "Review PR #42"
km add -p "Work/Q1" "Budget review" -d 2025-01-15
km add "Get approval" -w @sarah
km add "Deploy" -b "API migration"
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
- Automations remove from active boards

---

## km move

Re-parent task to different project.

### Usage

```bash
km move <id> <parent-id>         # Move by IDs
km move <id> --project "Name"    # Move by project name
km move <id> --root              # Move to root level
```

---

## Task Field Commands

Quick field changes:

```bash
km task set <id> waiting:@sarah        # Set waiting field
km task set <id> blocked:"API issue"   # Set blocked field
km task set <id> due:2025-01-20        # Set due date
km task set <id> p:1                   # Set priority

km task clear <id> waiting             # Clear waiting field
km task clear <id> blocked             # Clear blocked field

km task claim <id>                     # Assign to me
km task release <id>                   # Unassign
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

## Output Formats

### Default (Tree)

```
Work / Finance
  [ ] Review Q1 budget          due:Jan 15
  [ ] Send invoice              @bjorn

Personal / Health
  [ ] Call dentist              due:today
  [ ] ↻ Weekly review           Mon
```

### Flat (`--flat`)

```
[ ] Review Q1 budget    Work/Finance    due:Jan15
[ ] Send invoice        Work/Finance    @bjorn
[ ] Call dentist        Personal        due:today
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
- [km-tasks-data.md](km-tasks-data.md) — Data model, query syntax
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
