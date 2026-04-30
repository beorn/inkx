---
id: "@km/inbox/xihh"
aliases:
  - km-xihh
  - "@km/_orphan/xihh"
created_at: 2026-01-15T13:22:17Z
closed_at: 2026-01-16T08:02:52Z
---

# [x] Implement undo/redo for TUI2 @km/_orphan #feature #P4

Add undo/redo capability to TUI2 leveraging the Redux-style architecture.

Implementation approach:
1. Wrap dispatch() in useBoardState.ts to record state history
2. Maintain history stack of BoardState snapshots
3. Expose undo()/redo() functions from the hook
4. Wire Ctrl+Z (undo) and Ctrl+Shift+Z (redo) in App.tsx
5. Show undo/redo availability in StatusBar

The pure reducer + immutable state makes this straightforward - just need to snapshot states and restore on undo.