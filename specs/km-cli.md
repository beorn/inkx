# CLI Specification

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
km tree 01H5X               # Tree from node ID prefix
km show ./README.md         # Show specific file by path
km board @inbox             # Board by filename (resolves @inbox.md)
km board @inbox.md          # Same, with extension
km show "Next Actions"      # Show by content/title match
```

This "smart resolution" applies to: `board`, `tree`, `show`, `done`, `toggle`, and action commands.

---

## Commands

### Core Views

```bash
km list [query]             # List nodes (alias: ls)
km ls [query]               # Short form
km ls --type task           # Filter by type
km ls --type task --context # With ancestor paths (= tasks)
km ls --id                  # Show node IDs

km tree [node]              # Show structure from root (ID, path, or filename)
km tree --collapsed         # With collapsing
km tree --id                # Show node IDs

km show <node>              # Show node details (ID, path, or filename)

km board [node]             # Kanban board (TUI) - ID, path, or filename
km board @inbox             # Open @inbox.md board by filename
km board --id               # Show node IDs
```

### Task Commands

```bash
km task [query]             # List tasks (= km ls --type task --context)
km task --status open       # Filter by status
km task status <id> [status] # View or set task status (open, blocked, done, dropped)
km task create "title"      # Create a new task
km task assign <who> <id>   # Assign to agent or user
```

### Actions

```bash
km new "Task content"       # Quick capture to inbox
km new "Task" -p @next      # Create under parent (ID, path, or filename)
km done <node>              # Mark task done (ID, path, or filename)
km add <target> <source...> # Add tasks to board/list
km add @next TASKID         # Add task to @next board
km add @next ./inbox/**     # Add all inbox tasks to @next
km init                     # Create .km/ for persistence
```

### Output Formats

```bash
km task --json              # JSON output
km task --ids               # IDs only (for scripting)
km ls --json                # Works on all views
```

---

## Filters

```bash
# Path patterns (in query or --filter)
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

| Key     | Action                       |
| ------- | ---------------------------- |
| `h` `l` | Move between columns         |
| `j` `k` | Move between cards           |
| `Enter` | Expand card / toggle outline |
| `x`     | Toggle task done             |
| `o`     | Toggle outline mode          |
| `m`     | Multi-select mode            |
| `?`     | Help                         |
| `q`     | Quit                         |

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

| Key         | Action             |
| ----------- | ------------------ |
| `Enter`     | Toggle fold        |
| `Tab`       | Move into children |
| `Shift+Tab` | Move to parent     |

---

## km add

Add tasks to boards or lists. Moves tasks to a target container.

```bash
km add <target> <source...>      # Add tasks to target board/list
km add @next TASKID              # Add single task by ID
km add @next ./inbox/**          # Add all inbox tasks via query
km add @next status:open         # Add all open tasks
km add +project TASKID           # Add task to project
km add @next --dry-run TASKID    # Preview without changes
```

The target can be an ID, path, or filename (e.g., `@next`, `@inbox.md`, `+project`).
Sources can be task IDs or query patterns that match multiple tasks.

---

## Agent Commands (Future)

> See [km-agents.md](km-agents.md) for full specification.

### Managing Agents

```bash
km agent ls                 # List all agents
km agent create <spec>      # Create agent from YAML spec
km agent run <id>           # Run agent (continuous, pulls from queue)
km agent run <id> "task"    # Run agent for one-shot task
km agent stop <id>          # Stop a running agent
km agent queue <id>         # View agent's task queue
```

### Sessions

```bash
km session <id>             # View session transcript
km session ls --agent <id>  # List sessions for agent
```

---

## Configuration

```yaml
# ~/.config/km/config.yaml

defaults:
  board_columns: [open, blocked, done]

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
km task status $(km task --ids | fzf) done

# List and select
km show $(km ls --ids | fzf)
```

---

## See Also

- [Tasks CLI](km-tasks-cli.md) — Task-specific commands
- [UI](km-ui.md) — View behavior, collapsing
- [Overview](km-overview.md) — Quick start
- [Agents](km-agents.md) — Agent orchestration
