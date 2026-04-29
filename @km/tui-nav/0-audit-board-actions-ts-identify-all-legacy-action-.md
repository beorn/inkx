---
id: "@km/tui-nav/0-audit-board-actions-ts-identify-all-legacy-action-"
aliases:
  - km-tui-nav.0
  - km-tui-nav-0
  - "@km/tui-nav/0"
created_at: 2026-01-24T22:35:11Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Audit board-actions.ts: identify all legacy action dispatches @km/tui-nav #task #P2

Find all NAV_TO_PATH, CURSOR_MOVE, REFRESH dispatches in board-actions.ts and keyboard-helpers.ts.

Create a list of what needs to be replaced with navigation handler calls.

Output: Comment in bead with list of all legacy dispatches and their locations.