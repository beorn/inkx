---
id: "@km/_orphan/qokg"
aliases:
  - km-qokg
created_at: 2026-01-19T14:06:51Z
closed_at: 2026-01-19T14:09:36Z
---

# [x] Wire up @km/commands in Board.tsx @km/_orphan #task #P1

Actually integrate the command system that was built but never wired up:

1. Update Board.tsx to use processInkKey from @km/commands
2. Handle actions returned by the command system:
   - BoardAction → dispatch to boardReducer (needs to be added)
   - UIAction → dispatch to uiReducer
   - TaskSetStatusAction → update storage + refresh
   - HistoryAction → undo/redo (future)
3. Fall back to keyboard-handler.ts for unhandled keys
4. Test that all navigation works through command system

Infrastructure exists in:
- command-bridge.ts (state conversion utilities)
- board-adapter.ts (TUI ↔ tree state conversion)
- @km/commands (commands, keybindings, ink-adapter)