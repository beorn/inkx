---
id: "@km/_orphan/board-9"
aliases:
  - km-board-9
created_at: 2026-01-24T22:36:02Z
closed_at: 2026-01-27T19:58:39Z
---

# [x] Add integration tests for TUI keyboard navigation @km/_orphan #task #P1

Add tests at the TUI layer to verify keyboard input works end-to-end with navigation handlers.

These tests should have caught the issue where board-actions.ts dispatches legacy actions.

Test scenarios:
1. j/k navigation dispatches SELECT with correct nodeId
2. h/l navigation dispatches SELECT with correct nodeId  
3. Navigation at boundaries (first/last column/card) doesn't crash
4. All keyboard shortcuts work without dispatching legacy actions

Location: apps/@km/tui/tests/keyboard-navigation.test.tsx

Use existing test harness from board.slow.test.ts for setup.