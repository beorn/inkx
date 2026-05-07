---
mentions:
  - km
id: "@km/tui-nav/2-replace-cursor-move-with-navigation-handlers"
aliases:
  - km-tui-nav.2
  - km-tui-nav-2
  - "@km/tui-nav/2"
created_at: 2026-01-24T22:35:11Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Replace CURSOR_MOVE with navigation handlers @km/tui-nav #task #P2

Update board-actions.ts to use handleTreeNavigation instead of CURSOR_MOVE action.

Pattern:
  // Before:
  dispatchBoard({ type: 'CURSOR_MOVE', dir: direction });

// After:
  const targetId = handleTreeNavigation(direction, boardState, vault);
  if (targetId) dispatchBoard({ type: 'SELECT', nodeId: targetId });

Verify: No CURSOR_MOVE dispatches remain

