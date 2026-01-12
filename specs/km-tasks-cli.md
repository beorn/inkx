# Tasks CLI

Command-line interface for task management.

---

## Commands Overview

| Command        | Purpose                        |
|----------------|--------------------------------|
| `km task`      | List and filter tasks          |
| `km next`      | Next actions view              |
| `km inbox`     | Inbox view                     |
| `km add`       | Quick capture                  |
| `km done`      | Mark task done                 |
| `km board`     | View/manage boards             |
| `km move`      | Re-parent task                 |
| `km import`    | Import TextBundle              |
| `km export`    | Export TextBundle              |

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
km task --status <status>   # Filter by status
km task --status wip        # In progress tasks
km task --status waiting    # Waiting tasks
km task --status someday    # Someday tasks

km task --overdue           # Overdue tasks
km task --due today         # Due today
km task --due week          # Due this week

km task --project "Work"    # Tasks in project
km task --owner bjorn       # Assigned to user (first @)
km task --ref @bjorn        # Tasks referencing @bjorn
km task --ref "#finance"    # Tasks referencing #finance

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
```

---

## km next

Next actions view - tasks selected for immediate action.

### Usage

```bash
km next                     # Show next actions
km next add <id>            # Add task to next
km next remove <id>         # Remove from next
km next clear               # Clear all from next
```

### Behavior

- Shows tasks with `status = open` or `status = wip`
- Overdue tasks auto-surface at top
- Tasks ordered by manual priority in a "next list" (curated view)
- Adding places task in next list
- Removing takes task out of next list

### Examples

```bash
km next                     # List next actions
km next add 01HXY...        # Add by ID
km next add "call"          # Add by search match
km next remove 01HXY...     # Remove from next
```

---

## km inbox

Inbox view - unprocessed items.

### Usage

```bash
km inbox                    # Show inbox items
km inbox process            # Interactive processing
km inbox clear              # Clear processed items
```

### Interactive Processing

`km inbox process` walks through each item:

```
Inbox item 1 of 5:
"Call from John about project"

[t] Today  [p] Project  [s] Someday  [d] Done  [D] Delete  [n] Next
>
```

### Examples

```bash
km inbox                    # List inbox
km inbox --count            # Just show count
km inbox process            # Interactive mode
```

---

## km add

Quick capture - create new task.

### Usage

```bash
km add "Task title"                    # Add to inbox
km add -t "Task title"                 # Add to today
km add -p "Project" "Task title"       # Add to project
km add "Task @bjorn due:2025-01-15"    # With metadata
```

### Options

| Option            | Description                    |
|-------------------|--------------------------------|
| `-t, --today`     | Add to next list (curated)     |
| `-p, --project`   | Set parent project             |
| `-d, --due`       | Set due date                   |
| `-s, --start`     | Set start/scheduled date       |
| `-o, --owner`     | Assign to user                 |
| `-P, --priority`  | Set priority (1-5)             |

### Examples

```bash
km add "Call dentist"
km add -t "Review PR #42"
km add -p "Work/Q1" "Budget review" -d 2025-01-15
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
- For recurring tasks: clones with next occurrence
- Records completion timestamp

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

| Option            | Description                    |
|-------------------|--------------------------------|
| `--dry-run`       | Preview without importing      |
| `--project`       | Set parent for imported items  |
| `--assets`        | Asset handling (cas/alongside) |

### Examples

```bash
km import notes.textbundle
km import ~/Bear/Export/ --project "Imported/Bear"
km import backup.textpack --dry-run
```

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

| Option            | Description                    |
|-------------------|--------------------------------|
| `-o, --output`    | Output path (required)         |
| `--textbundle`    | Export as .textbundle (default)|
| `--textpack`      | Export as .textpack (compressed)|
| `--include-done`  | Include completed tasks        |

### Examples

```bash
km export 01HXY... -o task.textbundle
km export --all -o backup.textpack
km export --project "Work" -o work.textpack
```

---

## Status Shortcuts

Quick status changes:

```bash
km task status <id> <status>      # Set status
km task claim <id>                # Set wip, assign to me
km task release <id>              # Set open, unassign
km task wait <id> "reason"        # Set waiting
km task block <id>                # Set blocked
km task start <id> <date>         # Set start date
```

### Examples

```bash
km task claim 01HXY...
km task wait 01HXY... "Waiting for Sarah's review"
km task start 01HXY... 2025-01-20
```

---

## km board

View and manage boards (`@person`, `#tag`, `+project` nodes).

### Usage

```bash
km board                          # List all boards
km board @bjorn                   # View @bjorn's board
km board +website                 # View +website board
km board @bjorn add <id>          # Add task to board
km board @bjorn move <id> <col>   # Move task to column
```

### Options

| Option            | Description                    |
|-------------------|--------------------------------|
| `--column`        | Filter by column               |
| `--json`          | JSON output                    |

### Examples

```bash
km board @bjorn                   # View person board
km board "#finance"               # View tag board
km board +q1-planning             # View project board
km board @bjorn add 01HXY...      # Add task to @bjorn
km board @bjorn move 01HXY... discussed  # Move to column
```

---

## Output Formats

### Default (Tree)

```
Work / Finance / .md #
  [ ] Review Q1 budget          due:Jan 15
  [.] Send invoice              @bjorn

Personal / Health
  [ ] Call dentist              due:today
  [ ] ↻ Weekly review           Mon
```

Recurring tasks show `↻` indicator after the mark.

### Flat (`--flat`)

```
[ ] Review Q1 budget    Work/Finance    due:Jan15
[.] Send invoice        Work/Finance    @bjorn
[ ] Call dentist        Personal        due:today
[ ] ↻ Weekly review     Personal        ↻weekly Mon
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
    "content": "Weekly review",
    "status": "open",
    "recur": "FREQ=WEEKLY;BYDAY=MO",
    "recur_prev": "01HXW...",
    "ancestors": ["Personal"]
  }
]
```

---

## Environment Variables

| Variable       | Description                    |
|----------------|--------------------------------|
| `KM_DIR`       | Override .km directory         |
| `KM_USER`      | Default user for assignment    |
| `KM_ROOT`      | Default root directory         |

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
