---
id: "@km/inbox/flexx-cache-helpers"
aliases:
  - km-flexx-cache-helpers
  - "@km/_orphan/flexx-cache-helpers"
created_at: 2026-01-30T20:25:37Z
closed_at: 2026-01-30T21:23:54Z
assignee: claude:b8b4780b
---

# [x] [flexx] Cache isRow/isReverse and pass to helpers @km/_orphan #task #P2 @claude:b8b4780b

Pass isRow/isReverse booleans to resolveEdgeValue/isEdgeAuto instead of recomputing from flexDirection. Saves 5+ redundant function calls per node.