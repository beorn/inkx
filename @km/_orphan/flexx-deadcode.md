---
id: "@km/_orphan/flexx-deadcode"
aliases:
  - km-flexx-deadcode
created_at: 2026-01-31T21:00:29Z
closed_at: 2026-01-31T21:04:44Z
assignee: claude:b8b4780b
---

# [x] Remove unused distributeFlexSpace() function @km/_orphan #task #P3 @claude:b8b4780b

distributeFlexSpace() at layout-zero.ts:349-476 appears unused (dead code). The per-line variant distributeFlexSpaceForLine() is used instead. Remove or add comment explaining why it's kept.