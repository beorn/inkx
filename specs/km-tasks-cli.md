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
| `km new` | Quick capture (create task) |
| `km done` | Mark task done |
| `km move` | Re-parent task |
| `km init` | Initialize from template |
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

### Node Queries

Space-separated terms, AND-ed together. See [km-query.md](km-query.md) for full syntax.

```bash
km task @bjorn                     # Has @bjorn reference
km task +website status:open       # Has +website AND is open
km task ./inbox/** -status:done    # In inbox AND not done
km task "budget"                   # Full-text search
```

### Output Options

```bash
km task --verbose           # Show all fields
km task --flat              # Single-line format
km task --id                # Show task IDs
km task --json              # JSON output
km task --count             # Count only
```

---

## Board Commands

View and manage boards. Sigil (`@`, `+`, `#`) required.

### View Boards

```bash
km @next                    # View @next board
km @next/today              # View today column
km @next/waiting            # View waiting column
km @inbox                   # View @inbox board
km @someday                 # View someday board
km @bjorn                   # View person board
km +website                 # View project board
km '#finance'               # View tag board (quote in shell)
```

### Adding to Boards

```bash
# Add by node query
km @next add status:open due:today
km @next/today add +website status:open
km @next/waiting add @sarah

# Add by path
km @next add ./inbox/**

# Add specific nodes by ID
km @next add task-1 task-2

# Preview first
km @next add due:week --dry-run
```

### Removing from Boards

```bash
km @next remove status:done
km @next/waiting remove @sarah
```

### Moving Between Columns

```bash
km @next/today add task-id           # Move to today
km @next/waiting add task-id         # Move to waiting (sets blocked)
```

### Listing Board Contents

```bash
km @next list               # List all tasks on board
km @next/today list         # Just one column
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

## km new

Quick capture — create new task.

### Usage

```bash
km new "Task title"                    # Create in inbox
km new -n "Task title"                 # Create and add to @next
km new -p "Project" "Task title"       # Create under project
km new "Task @bjorn due:2025-01-15"    # With metadata
```

### Options

| Option | Description |
|--------|-------------|
| `-n, --next` | Add to @next board |
| `-p, --project` | Set parent project |
| `-d, --due` | Set due date |
| `-s, --start` | Set start/scheduled date |
| `-o, --owner` | Assign to user |
| `-P, --priority` | Set priority (1-5) |

### Examples

```bash
km new "Call dentist"
km new -n "Review PR #42"
km new -p "Work/Q1" "Budget review" -d 2025-01-15
km new "Weekly review" --recur "FREQ=WEEKLY;BYDAY=MO"
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
km task set <id> due:2025-01-20        # Set due date
km task set <id> p:1                   # Set priority
km task set <id> status:blocked        # Set blocked

km task clear <id> due                 # Clear due date

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
  [!] Waiting on callback       blocked
```

### Flat (`--flat`)

```
[ ] Review Q1 budget    Work/Finance    due:Jan15
[ ] Send invoice        Work/Finance    @bjorn
[ ] Call dentist        Personal        due:today
[!] Waiting on callback Personal        blocked
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
- [km-query.md](km-query.md) — Query language
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-templates.md](km-tasks-templates.md) — GTD and other templates
