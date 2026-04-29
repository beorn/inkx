---
id: "@km/tui1/7-keyboard-bindings-documentation"
aliases:
  - km-tui1.7
  - km-tui1-7
  - "@km/tui1/7"
created_at: 2026-01-16T23:47:10Z
closed_at: 2026-01-17T00:37:38Z
---

# [x] Keyboard bindings documentation @km/tui1 #task #P2

Document all keyboard bindings for TUI1 in a consistent format.

## Current State

Keyboard bindings are documented in various places:
- docs/06-ui.md (partial)
- HelpOverlay.tsx component (runtime help)
- Inline in Board.tsx

## Tasks

- [ ] Create comprehensive keyboard binding reference in docs/06-ui.md
- [ ] Ensure HelpOverlay shows all bindings
- [ ] Add vim-style notation (e.g., gg, G, Ctrl+d)

## Categories

### Navigation
- j/k: Down/Up
- h/l: Left/Right (columns)
- gg/G: Top/Bottom
- Tab: Next column
- Enter: Drill into item

### Actions
- x: Toggle task status
- d: Delete item
- a/A: Add item
- e: Edit item
- /: Search
- v: Change view mode
- ?: Help overlay

### Panels
- i: Toggle detail pane
- p: Project picker
- Esc: Close overlay

## Files

- docs/06-ui.md
- apps/@km/tui/packages/@km/_orphan/ink/src/views/HelpOverlay.tsx