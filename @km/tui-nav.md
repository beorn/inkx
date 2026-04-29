---
id: "@km/tui-nav"
aliases:
  - km-tui-nav
  - "@km/_orphan/tui-nav"
created_at: 2026-01-24T22:34:51Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Complete TUI navigation handler migration @km/tui-nav #epic #P2

Finish migrating TUI keyboard input from legacy NAV_TO_PATH/CURSOR_MOVE/REFRESH actions to navigation handlers (handleTreeNavigation, handleVisualNavigation).

Current issue: board-actions.ts still dispatches legacy actions that will crash the simplified boardReducer.

Remaining work from hazy-forging-crayon.md plan:
- Update keyboard input to use navigation handlers
- Delete board-actions.ts legacy code
- Remove TransitionalBoardAction
- Clean up BoardStateLegacy, BoardActionLegacy type definitions

Files to modify:
- apps/@km/tui/src/board-actions.ts (remove legacy dispatches)
- apps/@km/tui/src/keyboard-helpers.ts (remove REFRESH)
- apps/@km/tui/src/views/board-input.ts (already uses handlers - verify)
- packages/@km/_orphan/board/src/board-types.ts (clean up legacy types)

Tests must pass: 2594 baseline