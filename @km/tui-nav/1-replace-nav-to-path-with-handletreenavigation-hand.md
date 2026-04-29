---
id: "@km/tui-nav/1-replace-nav-to-path-with-handletreenavigation-hand"
aliases:
  - km-tui-nav.1
  - km-tui-nav-1
  - "@km/tui-nav/1"
created_at: 2026-01-24T22:35:11Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Replace NAV_TO_PATH with handleTreeNavigation/handleVisualNavigation @km/tui-nav #task #P2

Update board-actions.ts to compute target nodeId using navigation handlers, then dispatch SELECT instead of NAV_TO_PATH.

Pattern:
  // Before:
  dispatchBoard({ type: 'NAV_TO_PATH', path: [colIdx] });
  
  // After:
  const targetId = vault.getChildren(rootId)[colIdx]?.id;
  if (targetId) dispatchBoard({ type: 'SELECT', nodeId: targetId });

Verify: No NAV_TO_PATH dispatches remain