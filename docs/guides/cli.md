# CLI Reference

Commands and keyboard shortcuts for km.

---

## Node Resolution

Most commands accept an optional node identifier. The `resolveNode` function tries these in order:

```bash
km <command> [node]         # Node can be:
                            #   - Node ID (full or prefix/suffix)
                            #   - Filesystem path (./folder/file.md)
                            #   - Filename (@next.md or @next)
                            #   - Content/title match
```

Examples:

```bash
km show --tree 01H5X        # Tree from node ID prefix
km show ./README.md         # Show specific file by path
km view @next               # Board by filename (resolves @next.md)
km view @next.md            # Same, with extension
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
km view @next               # Open @next.md board by filename
km view --id                # Show node IDs
```

### Task Commands

```bash
km tasks [query]            # List tasks (= km ls --type task --context)
km tasks --all              # All tasks including done
km tasks --status open      # Filter by status
km tasks "budget"           # Full-text search

km tasks --verbose          # Show all fields
km tasks --flat             # Single-line format
km tasks --id               # Show task IDs
km tasks --json             # JSON output
km tasks --count            # Count only
```

### Board Commands

View and manage boards. Sigil (`@`, `+`, `#`) required:

```bash
km @next                    # View @next board
km @next/today              # View today column
km @next/inbox              # View inbox column
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
km tasks set <node> due:2025-01-20
km tasks set <node> priority:P1
km tasks set <node> status:blocked

km tasks clear <node> due

km tasks claim <node>       # Assign to me
km tasks release <node>     # Unassign
```

### Sync & Maintenance

```bash
km init                     # Create .km/ for persistence
km init gtd                 # Create with GTD boards
km init --no-gtd            # Skip GTD boards

km sync                     # Sync filesystem changes
km sync --watch             # Watch mode - continuous sync
km doctor                   # Diagnose store health
km doctor gc                # Compact stale events + vacuum db
km doctor rebuild           # Rebuild state.db from events + worktree
km doctor reset             # Reset from worktree only
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

See [ref/ui.md](../ref/ui.md#keybindings) for full TUI keybinding reference.

---

## Inbox Processing

```bash
km inbox process            # Interactive inbox processing
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

Config is loaded from `.km/config.yaml` or standard locations (`.kmrc.yaml`, `km.config.js`, etc.).

```yaml
# .km/config.yaml

# TUI settings
tui:
  watch: true # Enable file watching for live sync (default: true)
  watchWorker: true # Use worker thread for file watching (default: true)

# Beads issue tracking integration
beads:
  board: "issue" # Default board for issue queries
  parent: "issue/" # Directory for new issues
  prefix: "km" # Issue ID prefix (e.g., km-xxxx)
```

---

## See Also

- [guides/query.md](../guides/query.md) — Query language
- [ref/ui.md](../ref/visual-spec.md) — Views, navigation, design system
- [tasks.md](tasks.md) — Task management
