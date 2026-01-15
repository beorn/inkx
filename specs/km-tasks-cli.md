# Tasks CLI

Command-line interface for task management.

---

## Commands Overview

| Command     | Purpose                     |
| ----------- | --------------------------- |
| `km task`   | List, filter, query tasks   |
| `km @board` | View/manage `@` board       |
| `km +board` | View/manage `+` board       |
| `km #board` | View/manage `#` board       |
| `km new`    | Quick capture (create task) |
| `km status` | View/set task status        |
| `km add`    | Add tasks to board/list     |
| `km move`   | Re-parent task              |
| `km init`   | Initialize from template    |

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
km task +website status:todo       # Has +website AND is open
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
km @next add status:todo due:today
km @next/today add +website status:todo
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

| Option           | Description                         |
| ---------------- | ----------------------------------- |
| `-n, --next`     | Add to @next board                  |
| `-p, --parent`   | Parent node (ID, path, or filename) |
| `-d, --due`      | Set due date                        |
| `-s, --start`    | Set start/scheduled date            |
| `-o, --owner`    | Assign to user                      |
| `-P, --priority` | Set priority (1-5)                  |

### Examples

```bash
km new "Call dentist"
km new -n "Review PR #42"
km new -p @next "Review PR #42"        # Create under @next board
km new -p ./projects/q1.md "Budget"    # Create under specific file
km new "Weekly review" --recur "FREQ=WEEKLY;BYDAY=MO"
```

---

## km status

View or set task status.

### Usage

```bash
km status <node>            # View current status
km status <node> done       # Mark done (by ID, path, or filename)
km status <node> open       # Re-open task
km status <node> blocked    # Mark as blocked
km status <node> dropped    # Drop/cancel task
km status ABCD1234 done     # By ID prefix/suffix
km status ./inbox/task.md done  # By path
```

Node resolution tries: exact ID, ID prefix, ID suffix, path, filename, content match.

### Behavior

- Sets `status` to specified value
- For recurring tasks marked done: clones with next occurrence
- Automations remove from active boards when done/dropped

---

## km move

Re-parent task to different project.

### Usage

```bash
km move <node> <parent>          # Move by ID, path, or filename
km move <node> --project "Name"  # Move by project name
km move <node> --root            # Move to root level
```

---

## Task Field Commands

Quick field changes. All accept ID, path, or filename:

```bash
km task set <node> due:2025-01-20      # Set due date
km task set <node> p:1                 # Set priority
km task set <node> status:blocked      # Set blocked

km task clear <node> due               # Clear due date

km task claim <node>                   # Assign to me
km task release <node>                 # Unassign
```

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
    "status": "todo",
    "due": "2025-01-15",
    "owner": "bjorn",
    "references": ["@bjorn", "#finance", "+q1"],
    "ancestors": ["Work", "Finance"]
  }
]
```

---

## Environment Variables

| Variable  | Description                 |
| --------- | --------------------------- |
| `KM_DIR`  | Override .km directory      |
| `KM_USER` | Default user for assignment |
| `KM_ROOT` | Default root directory      |

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-query.md](km-query.md) — Query language
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-templates.md](km-tasks-templates.md) — GTD and other templates
