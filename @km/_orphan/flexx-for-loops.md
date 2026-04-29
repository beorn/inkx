---
id: "@km/_orphan/flexx-for-loops"
aliases:
  - km-flexx-for-loops
created_at: 2026-01-30T20:25:38Z
closed_at: 2026-01-30T20:28:43Z
---

# [x] [flexx] Replace reduce/some with for-loops in hot paths @km/_orphan #task #P3 @claude:b8b4780b

Replace .reduce() and .some() with traditional for-loops at lines 768, 800, 808, 873 to avoid closure allocations.