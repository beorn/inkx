---
id: "@km/_orphan/so3x"
aliases:
  - km-so3x
created_at: 2026-01-19T14:51:40Z
closed_at: 2026-01-19T15:25:04Z
---

# [x] Delete keyboard-handler.ts - all keys go through commands @km/_orphan #task #P2

Final cleanup: delete keyboard-handler.ts entirely.

After all commands are in @km/commands:
- Board.tsx useInput() routes ALL keys to processInkKey()
- No TUI-specific key handling split
- keyboard-helpers.ts may still be needed for selection range calculation
- keyboard-card-ops.ts operations become command effects

This completes the command system migration - single keyboard router.