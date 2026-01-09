# Kimmi CLI Specification

Command-line interface for task and knowledge management.

---

## Overview

km-cli is a terminal-based outliner, task manager, and boardliner. It provides:

- **Outliner view** — hierarchical tree navigation
- **Board view** — kanban-style columns
- **Task management** — Asana-like workflow
- **Beads compatibility** — git-native task tracking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  km-cli                                                     │
│                                                             │
│  Commands ──► Query state.db ──► Render TUI                 │
│      │                                                      │
│      ▼                                                      │
│  Mutations ──► emit(events) ──► state.db                    │
│                     │                                       │
│                     ▼                                       │
│               events.jsonl                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands

### Task Management (Asana Replacement)

```bash
# List tasks
km list                    # All open tasks
km list --project <id>     # Tasks in project
km list --assignee me      # My tasks
km list --due today        # Due today
km list --status waiting   # Waiting on something

# Inbox / Today workflow
km inbox                   # Unprocessed tasks
km today                   # Today's tasks
km ready                   # Ready to work on (beads-compatible)

# Quick capture
km add "Task title"
km add "Task title" --project <id>
km add "Task title" --due 2024-01-15
km add "Task title" --priority 1

# Task actions
km done <id>               # Mark complete
km start <id>              # Mark in progress
km wait <id> "reason"      # Mark waiting
km block <id> <blocker-id> # Mark blocked by
km schedule <id> 2024-01-15 # Schedule for date
km assign <id> <agent-id>  # Assign to agent

# Task details
km show <id>               # Show task with subtasks
km edit <id>               # Open in editor
km comment <id> "text"     # Add comment

# Bulk operations
km done $(km list --project X --status done)
km move <id>... --to <project-id>
```

### Navigation

```bash
# Tree view (outliner)
km tree                    # Full tree
km tree <id>               # Subtree from node
km tree --depth 2          # Limit depth

# Board view (kanban)
km board                   # Default board
km board <id>              # Specific board
km board --by status       # Group by status
km board --by project      # Group by project

# Search
km search "query"          # Full-text search
km search "query" --type task
km search "query" --in <id>  # Search within subtree

# Recent
km recent                  # Recently modified
km recent --type file      # Recent files
```

### Projects

```bash
# List projects
km project list
km project list --status active

# Project details
km project show <id>
km project tree <id>       # Project as tree

# Create project
km project create "Name"
km project create "Name" --template sprint
```

### Node Operations

```bash
# Create
km create folder "Name" --in <parent-id>
km create file "Name.md" --in <parent-id>
km create section "Heading" --in <file-id>

# Move
km move <id> --to <parent-id>
km move <id> --after <sibling-id>
km move <id> --before <sibling-id>

# Delete
km delete <id>
km delete <id> --recursive

# Link
km link <id> --to <target-id>  # Create symlink
```

### Sync & Maintenance

```bash
# Watch mode
km watch                   # Start bidirectional sync

# Rebuild
km rebuild                 # Rebuild state.db from events
km rebuild --from-fs       # Rebuild from filesystem

# Status
km status                  # Sync status
km events                  # Recent events
km events --type task_completed --since 24h
```

---

## TUI (Terminal UI)

### Outliner Mode

```
╭─ km tree ──────────────────────────────────────────────────╮
│                                                             │
│  ▼ 📁 projects                                              │
│    ▼ 📄 Kimmi                                               │
│      ▶ 📑 Overview                                          │
│      ▼ 📑 Tasks                                             │
│        ☐ Implement km-watch                                 │
│        ☑ Design data model                                  │
│        ◐ Write CLI spec                      ← cursor       │
│      ▶ 📑 Notes                                             │
│    ▶ 📄 Mama Muse                                           │
│  ▶ 📁 areas                                                 │
│  ▼ 📁 inbox                                                 │
│    ☐ Review PR #123                                         │
│    ☐ Call dentist                                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:move  ↵:open  x:done  e:edit  a:add  /:search  ?:help  │
╰─────────────────────────────────────────────────────────────╯
```

### Board Mode

```
╭─ km board ─────────────────────────────────────────────────╮
│                                                             │
│  ┌─ Inbox ──────┐ ┌─ Today ─────┐ ┌─ In Progress ┐ ┌─ Done ─┐
│  │              │ │             │ │              │ │        │
│  │ ☐ Review PR  │ │ ☐ Write CLI │ │ ◐ km-watch   │ │ ☑ Data │
│  │ ☐ Call dentist│ │ ☐ Test sync│ │              │ │ model  │
│  │              │ │             │ │              │ │        │
│  │              │ │             │ │              │ │ ☑ Event│
│  │              │ │             │ │              │ │ system │
│  │              │ │             │ │              │ │        │
│  └──────────────┘ └─────────────┘ └──────────────┘ └────────┘
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ h/l:columns  j/k:tasks  ↵:open  m:move  x:done  ?:help     │
╰─────────────────────────────────────────────────────────────╯
```

### Task Detail Mode

```
╭─ km show 01H5X... ─────────────────────────────────────────╮
│                                                             │
│  ◐ Write CLI spec                                           │
│                                                             │
│  Status:     In Progress                                    │
│  Priority:   High (1)                                       │
│  Due:        2024-01-15                                     │
│  Project:    Kimmi                                          │
│  Assigned:   —                                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ## Subtasks                                                │
│                                                             │
│  ☑ Define command structure                                 │
│  ☑ Design TUI layout                                        │
│  ☐ Implement list command                                   │
│  ☐ Implement board command                                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ## Notes                                                   │
│                                                             │
│  CLI should feel like a mix of taskwarrior and broot.       │
│  Focus on keyboard-driven workflow.                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ e:edit  x:done  c:comment  s:subtask  ←:back  ?:help       │
╰─────────────────────────────────────────────────────────────╯
```

---

## Output Formats

### Default (Human-Readable)

```bash
$ km list --due today

Today's Tasks (3)

  ◐ 01H5X  Write CLI spec                    Kimmi      High
  ☐ 01H5Y  Review PR #123                    —          Normal
  ☐ 01H5Z  Call dentist                      Personal   Low

```

### JSON

```bash
$ km list --due today --json

[
  {
    "id": "01H5X...",
    "type": "task",
    "content": "Write CLI spec",
    "task_status": "in_progress",
    "priority": 1,
    "due_date": "2024-01-15",
    "project": { "id": "...", "name": "Kimmi" }
  },
  ...
]
```

### IDs Only (for Scripting)

```bash
$ km list --due today --ids
01H5X...
01H5Y...
01H5Z...

# Useful for:
$ km done $(km list --project X --status done --ids)
```

### Tree Format

```bash
$ km tree --format tree

projects/
├── Kimmi/
│   ├── Overview
│   ├── Tasks/
│   │   ├── ☐ Implement km-watch
│   │   └── ◐ Write CLI spec
│   └── Notes
└── Mama Muse/
    └── ...
```

---

## Beads Compatibility

### Task Format

Beads-style task references work:

```bash
# Reference by short ID
km show 01H5X

# Reference by title substring
km show "CLI spec"

# Ready command (like 'bd ready')
km ready
```

### Event Log

```bash
# View events (like git log)
km events
km events --type task_completed
km events --actor agent-1
km events --since "2 days ago"

# Show specific event
km event show 01H5X...
```

---

## Filters & Queries

### Filter Syntax

```bash
# By status
km list status:open
km list status:in_progress,waiting

# By date
km list due:today
km list due:this-week
km list due:overdue
km list due:2024-01-15
km list due:>2024-01-01

# By priority
km list priority:1
km list priority:high
km list priority:>=2

# By project
km list project:Kimmi
km list project:none

# By assignee
km list assignee:me
km list assignee:agent-1
km list assignee:none

# By type
km list type:task
km list type:file

# Combined
km list status:open priority:1 due:this-week
```

### Sort Order

```bash
km list --sort priority      # By priority (high first)
km list --sort due           # By due date
km list --sort updated       # Recently updated
km list --sort created       # Recently created
km list --sort manual        # Manual sort order

km list --sort priority --reverse
```

---

## Configuration

```yaml
# ~/.config/km/config.yaml

# Default views
defaults:
  list_sort: priority
  list_status: open,in_progress
  tree_depth: 3
  board_columns: [inbox, today, in_progress, done]

# TUI settings
tui:
  theme: dark
  icons: true  # Use emoji/nerd font icons
  vim_keys: true

# Editor
editor: $EDITOR  # or: nvim, code, etc.

# Aliases
aliases:
  td: "list due:today"
  ib: "inbox"
  pr: "list project:Kimmi status:open"
```

---

## Keybindings

### Global

| Key | Action |
|-----|--------|
| `q` | Quit |
| `?` | Help |
| `/` | Search |
| `:` | Command mode |
| `R` | Refresh |

### Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `h` / `←` | Collapse / Go to parent |
| `l` / `→` | Expand / Enter |
| `g` | Go to top |
| `G` | Go to bottom |
| `Enter` | Open / Select |
| `Esc` | Back / Cancel |

### Task Actions

| Key | Action |
|-----|--------|
| `x` | Toggle done |
| `s` | Start (in progress) |
| `w` | Wait |
| `b` | Block |
| `d` | Set due date |
| `p` | Set priority |
| `m` | Move |
| `a` | Add subtask |
| `e` | Edit |
| `c` | Comment |
| `D` | Delete |

### Board Mode

| Key | Action |
|-----|--------|
| `h` / `l` | Move between columns |
| `J` / `K` | Move task within column |
| `H` / `L` | Move task to prev/next column |

---

## Shell Integration

### Completions

```bash
# Bash
eval "$(km completions bash)"

# Zsh
eval "$(km completions zsh)"

# Fish
km completions fish | source
```

### Prompt Integration

```bash
# Show task count in prompt
km_prompt() {
  local count=$(km list status:open --count 2>/dev/null)
  [[ $count -gt 0 ]] && echo "[$count]"
}
PS1='$(km_prompt) \$ '
```

### fzf Integration

```bash
# Interactive task selection
km list --ids | fzf --preview 'km show {}'

# Quick done
km done $(km list --ids | fzf -m)
```

---

## Implementation

### Tech Stack

- **Language**: TypeScript (Bun runtime)
- **TUI**: [Ink](https://github.com/vadimdemedes/ink) or [blessed](https://github.com/chjj/blessed)
- **Database**: better-sqlite3
- **CLI parsing**: [commander](https://github.com/tj/commander.js) or [yargs](https://yargs.js.org/)

### Entry Points

```typescript
// src/cli/index.ts
import { program } from 'commander'

program
  .name('km')
  .description('Kimmi - Knowledge & Task Management')
  .version('0.1.0')

// Task commands
program
  .command('list')
  .description('List tasks')
  .option('--status <status>', 'Filter by status')
  .option('--project <project>', 'Filter by project')
  .option('--due <date>', 'Filter by due date')
  .option('--json', 'Output as JSON')
  .option('--ids', 'Output IDs only')
  .action(listTasks)

program
  .command('add <title>')
  .description('Add a new task')
  .option('--project <id>', 'Add to project')
  .option('--due <date>', 'Set due date')
  .option('--priority <n>', 'Set priority')
  .action(addTask)

// ... more commands

program.parse()
```

---

## References

- [taskwarrior](https://taskwarrior.org/) — CLI task manager
- [broot](https://dystroy.org/broot/) — Tree navigator
- [lazygit](https://github.com/jesseduffield/lazygit) — TUI inspiration
- [Ink](https://github.com/vadimdemedes/ink) — React for CLI
