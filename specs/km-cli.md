# CLI Specification

Commands and keyboard shortcuts for km.

---

## Commands

### Views

```bash
km tasks                    # List all tasks with context
km tasks --filter 'path/**' # Filter by path pattern
km tasks --status open      # Filter by status
km tasks --id               # Show node IDs

km board                    # Kanban board (TUI)
km board <path>             # Board rooted at path
km board --id               # Show node IDs

km tree                     # Show actual structure
km tree --collapsed         # With collapsing
km tree --id                # Show node IDs

km show <id>                # Show node details
```

### Actions

```bash
km toggle <id>              # Toggle task status
km init                     # Create .km/ for persistence
```

### Output Formats

```bash
km tasks --json             # JSON output
km tasks --ids              # IDs only (for scripting)
```

---

## Filters

```bash
# Path patterns
km tasks --filter 'projects/**'
km tasks --filter '*.md'

# Status
km tasks --status open
km tasks --status done
km tasks --status in_progress

# Combined
km tasks --filter 'work/**' --status open
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
```

---

## See Also

- [Display](km-display.md) — View behavior, collapsing
- [Overview](km-overview.md) — Quick start
