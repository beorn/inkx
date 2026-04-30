---
id: "@km/inbox/f1jf"
aliases:
  - km-f1jf
  - "@km/_orphan/f1jf"
created_at: 2026-01-16T16:58:31Z
closed_at: 2026-01-16T17:11:10Z
---

# [x] TUI2: Redesign status bar to match TUI1 format @km/_orphan #feature #P0

TUI1 status bar shows:
- Left: 'DISK REPO /path/to/vault' (green text)
- Right: '[COLUMNS VIEW]' with inverse/boxed styling

TUI2 currently shows:
- '139x50 | Col 1/1 | Item 1 | columns' (debug-style gray text)

The TUI2 format is useful for development but doesn't match TUI1's user-facing design.

Files: apps/@km/tui/packages/@km/_orphan/opentui/src/components/StatusBar.tsx

Reference: Board.tsx lines 2626-2660