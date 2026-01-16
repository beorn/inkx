# CLI Reference

Commands and keyboard shortcuts for km.

---

## Node Resolution

Most commands accept an optional node identifier. The `resolveNode` function tries these in order:

```bash
km <command> [node]         # Node can be:
                            #   - Node ID (full or prefix/suffix)
                            #   - Filesystem path (./folder/file.md)
                            #   - Filename (@inbox.md or @inbox)
                            #   - Content/title match
```

Examples:

```bash
km show --tree 01H5X        # Tree from node ID prefix
km show ./README.md         # Show specific file by path
km view @inbox              # Board by filename (resolves @inbox.md)
km view @inbox.md           # Same, with extension
km show "Next Actions"      # Show by content/title match
```

This "smart resolution" applies to: `view`, `show`, `status`, and action commands.

---

## Core Commands

### List & View

```bash
km list [query]             # List nodes (alias: ls)
km ls [query]               # Short form
km ls --type task           # Filter by type
km ls --type task --context # With ancestor paths (= tasks)
km ls --id                  # Show node IDs
km ls "search term"         # Full-text search

km show <node>              # Show node details
km show --tree <node>       # Show subtree structure
km show --tree --collapsed  # With collapsing
km show --id                # Show node IDs

km view [node]              # Kanban board (TUI)
km view @inbox              # Open @inbox.md board by filename
km view --id                # Show node IDs
```

### Task Commands

```bash
km task [query]             # List tasks (= km ls --type task --context)
km task --all               # All tasks including done
km task --status open       # Filter by status
km task "budget"            # Full-text search

km task --verbose           # Show all fields
km task --flat              # Single-line format
km task --id                # Show task IDs
km task --json              # JSON output
km task --count             # Count only
```

### Board Commands

View and manage boards. Sigil (`@`, `+`, `#`) required:

```bash
km @next                    # View @next board
km @next/today              # View today column
km @inbox                   # View @inbox board
km @someday                 # View someday board
km @bjorn                   # View person board
km +website                 # View project board
km '#finance'               # View tag board (quote in shell)

# Adding to boards
km @next add status:todo due:today
km @next add ./inbox/**
km @next add task-1 task-2
km @next add --dry-run TASKID    # Preview

# Removing from boards
km @next remove status:done

# List board contents
km @next list
km @next/today list
```

### Actions

```bash
km new "Task content"       # Quick capture to inbox
km new -n "Task title"      # Create and add to @next
km new -p "Parent" "Title"  # Create under parent
km new "Task @bjorn due:2025-01-15"  # With metadata

km status <node>            # View task status
km status <node> done       # Mark done
km status <node> open       # Re-open
km status <node> blocked    # Mark blocked
km status <node> dropped    # Drop/cancel

km move <node> <parent>     # Move node to new parent
km move <node> --project "Name"
km move <node> --root       # Move to root level

km add <target> <source...> # Add tasks to board
km add @next TASKID
km add @next ./inbox/**
```

### Task Field Commands

```bash
km task set <node> due:2025-01-20
km task set <node> p:1
km task set <node> status:blocked

km task clear <node> due

km task claim <node>        # Assign to me
km task release <node>      # Unassign
```

### Sync & Maintenance

```bash
km init                     # Create .km/ for persistence
km init gtd                 # Create with GTD boards
km init --no-gtd            # Skip GTD boards

km sync                     # Sync filesystem changes
km sync --watch             # Watch mode - continuous sync
km rebuild                  # Rebuild state.db from events.jsonl
```

---

## Filters

```bash
# Path patterns
km task 'projects/**'
km task --filter '*.md'

# Status
km task --status open
km task --status done
km task --status blocked

# Type (for list/ls)
km ls --type task
km ls --type section
km ls --type file

# Combined
km task 'work/**' --status open
```

---

## Output Formats

```bash
km task --json              # JSON output
km task --ids               # IDs only (for scripting)
km ls --json                # Works on all views
```

---

## TUI Keybindings

### Navigation

| Key     | Action                 |
| ------- | ---------------------- |
| `h` `l` | Move between columns   |
| `j` `k` | Move between cards     |
| `g` `G` | First / last item      |
| `Enter` | Zoom in / expand       |
| `u`     | Zoom out               |
| `[` `]` | History back / forward |

### Actions

| Key | Action                     |
| --- | -------------------------- |
| `x` | Toggle task done           |
| `n` | New task                   |
| `p` | Project picker (re-parent) |
| `d` | Delete (with confirmation) |
| `m` | Move mode                  |

### Selection

| Key      | Action              |
| -------- | ------------------- |
| `v`      | Multi-select mode   |
| `⇧+hjkl` | Extend selection    |
| `A`      | Select all siblings |
| `Escape` | Clear selection     |

### View Modes

| Key | Action         |
| --- | -------------- |
| `o` | Toggle outline |
| `?` | Help           |
| `/` | Search         |
| `q` | Quit           |

### Outline Mode

| Key         | Action             |
| ----------- | ------------------ |
| `Enter`     | Toggle fold        |
| `Tab`       | Move into children |
| `Shift+Tab` | Move to parent     |

---

## Inbox Processing

```bash
km @inbox process           # Interactive processing
```

For each item:

```
Inbox item 1 of 5:
"Call from John about project"

[n] @next  [p] Project  [s] Someday  [d] Done  [D] Delete
>
```

---

## Shell Integration

```bash
# Completions
eval "$(km completions bash)"
eval "$(km completions zsh)"

# Quick status change
km status $(km task --ids | fzf) done

# List and select
km show $(km ls --ids | fzf)
```

---

## Environment Variables

| Variable  | Description                 |
| --------- | --------------------------- |
| `KM_DIR`  | Override .km directory      |
| `KM_USER` | Default user for assignment |
| `KM_ROOT` | Default root directory      |

---

## Configuration

```yaml
# ~/.config/km/config.yaml

defaults:
  board_columns: [open, blocked, done]

tui:
  vim_keys: true

favorites:
  1: "@next"
  2: "@inbox"
  3: "@someday"
  4: "+current-project"
```

Favorites: Number keys `1-6` open favorite boards.

---

## See Also

- [06-query.md](06-query.md) — Query language
- [07-navigation.md](07-navigation.md) — Visual navigation model
- [08-ui.md](08-ui.md) — TUI design system
- [10-tasks.md](10-tasks.md) — Task management
