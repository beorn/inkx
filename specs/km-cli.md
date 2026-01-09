# CLI Specification

Commands and keyboard shortcuts for km.

---

## Query Argument

Most commands accept an optional `[query]` that specifies a root node:

```bash
km <command> [query]        # Query can be:
                            #   - Node ID (full or prefix)
                            #   - Path pattern (projects/**)
                            #   - Relative path (./folder)
```

Examples:
```bash
km list projects/           # Nodes under projects/
km tree 01H5X               # Tree from node ID prefix
km show ./README.md         # Show specific file
```

---

## Commands

### Core Views

```bash
km list [query]             # List nodes (alias: ls)
km ls [query]               # Short form
km ls --type task           # Filter by type
km ls --type task --context # With ancestor paths (= tasks)
km ls --id                  # Show node IDs

km tree [query]             # Show structure from root
km tree --collapsed         # With collapsing
km tree --id                # Show node IDs

km show <query>             # Show node details

km board [query]            # Kanban board (TUI)
km board --id               # Show node IDs
```

### Convenience Aliases

```bash
km tasks [query]            # = km list --type task --context
km tasks --status open      # Filter by status
```

`tasks` is shorthand for listing tasks with their collapsed ancestor context.

### Actions

```bash
km toggle <id>              # Toggle task status
km init                     # Create .km/ for persistence
```

### Output Formats

```bash
km tasks --json             # JSON output
km tasks --ids              # IDs only (for scripting)
km ls --json                # Works on all views
```

---

## Filters

```bash
# Path patterns (in query or --filter)
km tasks 'projects/**'
km tasks --filter '*.md'

# Status
km tasks --status open
km tasks --status done
km tasks --status in_progress

# Type (for list/ls)
km ls --type task
km ls --type section
km ls --type file

# Combined
km tasks 'work/**' --status open
```

---

## Board TUI

Full-screen kanban interface.

### Layout

```
┌─ Column 1 ─────┐ ┌─ Column 2 ─────┐ ┌─ Column 3 ─────┐
│                │ │                │ │                │
│ [ ] Task A     │ │ [/] Task B     │ │ [x] Task C     │
│ [ ] Task D     │ │                │ │ [x] Task E     │
│                │ │                │ │                │
└────────────────┘ └────────────────┘ └────────────────┘
```

### Keybindings

| Key | Action |
|-----|--------|
| `h` `l` | Move between columns |
| `j` `k` | Move between cards |
| `Enter` | Expand card / toggle outline |
| `x` | Toggle task done |
| `o` | Toggle outline mode |
| `m` | Multi-select mode |
| `?` | Help |
| `q` | Quit |

### Outline Mode

Cards expand to show children:

```
┌─ Projects ─────────────────────┐
│                                │
│ ▼ Auth                         │
│   [ ] Implement OAuth          │
│   [ ] Add tests                │
│ ▶ Database (2)                 │
│                                │
└────────────────────────────────┘
```

| Key | Action |
|-----|--------|
| `Enter` | Toggle fold |
| `Tab` | Move into children |
| `Shift+Tab` | Move to parent |

---

## Task Actions (Future)

```bash
km done <id>                # Mark complete
km start <id>               # Mark in progress
km add "Task title"         # Quick capture
km add "Task" --in <id>     # Add under parent
```

---

## Configuration

```yaml
# ~/.config/km/config.yaml

defaults:
  board_columns: [open, in_progress, done]

tui:
  vim_keys: true
```

---

## Shell Integration

```bash
# Completions
eval "$(km completions bash)"
eval "$(km completions zsh)"

# Quick done
km toggle $(km tasks --ids | fzf)

# List and select
km show $(km ls --ids | fzf)
```

---

## See Also

- [UI](km-ui.md) — View behavior, collapsing
- [Overview](km-overview.md) — Quick start
