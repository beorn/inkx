---
id: "@km/tui-nav/5-delete-boardstatelegacy-and-boardactionlegacy-type"
aliases:
  - km-tui-nav.5
  - km-tui-nav-5
  - "@km/tui-nav/5"
created_at: 2026-01-24T22:35:11Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Delete BoardStateLegacy and BoardActionLegacy type definitions @km/tui-nav #task #P2

Clean up deprecated types from board-types.ts.

1. Remove BoardStateLegacy interface
2. Remove BoardActionLegacy type
3. Remove NodeDirection type (only used by legacy code)
4. Run tests to verify nothing breaks

Verify: grep shows no references to these types except in @km/_orphan/repl (which has its own local copy)