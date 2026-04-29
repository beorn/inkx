---
id: "@km/_orphan/flexx-nested"
aliases:
  - km-flexx-nested
created_at: 2026-01-30T21:19:50Z
closed_at: 2026-01-30T21:27:31Z
---

# [x] Optimize flexx nested layout performance @km/_orphan #task #P2 @claude:b8b4780b

Yoga is 1.32x faster on deep nesting (10 levels). Investigate recursion overhead in layoutNode. Consider: iterative approach, better caching for nested containers, or reducing layoutNode call count per node.