---
id: "@km/_orphan/flexx-recursion"
aliases:
  - km-flexx-recursion
created_at: 2026-01-31T21:00:28Z
closed_at: 2026-01-31T21:05:53Z
assignee: claude:b8b4780b
---

# [x] Replace recursive tree traversals with iterative to avoid stack overflow @km/_orphan #task #P2 @claude:b8b4780b

resetLayoutCache() and propagatePositionDelta() use recursion which can overflow the call stack on deep TUI trees. Replace with iterative traversal using a reusable module-level stack array.