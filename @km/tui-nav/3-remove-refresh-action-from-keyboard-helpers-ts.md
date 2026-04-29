---
id: "@km/tui-nav/3-remove-refresh-action-from-keyboard-helpers-ts"
aliases:
  - km-tui-nav.3
  - km-tui-nav-3
  - "@km/tui-nav/3"
created_at: 2026-01-24T22:35:11Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Remove REFRESH action from keyboard-helpers.ts @km/tui-nav #task #P2

The REFRESH action is legacy - board state is now derived from vault on every render.

Delete or update the refresh handler to not dispatch REFRESH.

Verify: No REFRESH dispatches remain