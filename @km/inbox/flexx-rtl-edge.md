---
id: "@km/inbox/flexx-rtl-edge"
aliases:
  - km-flexx-rtl-edge
  - "@km/_orphan/flexx-rtl-edge"
created_at: 2026-01-31T16:34:22Z
closed_at: 2026-01-31T17:34:21Z
assignee: claude:b8b4780b
---

# [x] Fix RTL EDGE_START/END and overflow-no-shrink edge cases @km/_orphan #bug #P2 @claude:b8b4780b

4 failing tests in flexx:
- overflow-no-shrink: items overflow when shrink=0
- RTL EDGE_START/END positioning (3 tests)

These are edge cases discovered during FOSS publication work.