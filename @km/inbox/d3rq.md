---
mentions:
  - km
  - km
id: "@km/inbox/d3rq"
aliases:
  - km-d3rq
  - "@km/_orphan/d3rq"
created_at: 2026-01-19T14:34:54Z
closed_at: 2026-01-19T14:46:06Z
---

# [x] Complete @km/commands migration - remove keyboard-handler fallbacks @km/_orphan #task #P2

The command system migration is in a hybrid state:

1. Keys are recognized by @km/commands
2. But `handleCommandAction` delegates back to `handleKeyboardWrapper`
3. Line 202: 'Fall back to legacy keyboard handler'
4. Duplicate implementations exist in both systems

Work needed:

- Move implementations from keyboard-handler.ts into Board.tsx action handlers
- Remove delegation patterns that call handleKeyboardWrapper
- Remove the fallback to legacy keyboard handler
- Keep only TUI-specific handlers in keyboard-handler.ts (dialogs, quit, favorites)

