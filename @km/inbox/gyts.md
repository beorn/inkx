---
id: "@km/inbox/gyts"
aliases:
  - km-gyts
  - "@km/_orphan/gyts"
created_at: 2026-01-20T10:38:36Z
closed_at: 2026-01-20T11:52:12Z
---

# [x] Test inkx borderDimColor behavior with nested Text @km/_orphan #task #P2

Ink issue #840 reports borderDimColor incorrectly dims child Text components at the left edge of Box components.

Test scenario:
- Box with borderDimColor and nested Text children
- Verify Text at left edge is not incorrectly dimmed
- Test various border styles with dimColor

Reference: https://github.com/vadimdemedes/ink/issues/840