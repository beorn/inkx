---
id: "@km/inbox/clza"
aliases:
  - km-clza
  - "@km/_orphan/clza"
created_at: 2026-01-19T15:23:13Z
closed_at: 2026-01-20T07:31:41Z
---

# [x] Document missing TUI commands in docs/09-commands.md @km/_orphan #task #P4

## Problem

13+ commands are implemented but not documented in `docs/09-commands.md`:

### TUI-specific
- `quit` (q) - Exit the TUI
- `new_item` (n) - Open new item dialog
- `project_picker` (p) - Open project picker
- `close_or_quit` (Escape) - Contextual close/quit
- `outdent` (Shift+Tab) - Move item to parent level
- `delete_node` (D) - Delete current node
- `open_detail_pane` (Enter) - Open detail pane

### Navigation
- `favorite_1` through `favorite_9` (1-9) - Jump to favorite boards
- `column_1` through `column_9` (!@#$%^&*() - Jump to columns

### Also missing
- Alternative keybindings (Alt+hjkl variants for shift commands)
- Clarification that Escape maps to close_or_quit, not clear_selection

### Impact

Users can't discover all available shortcuts from documentation.