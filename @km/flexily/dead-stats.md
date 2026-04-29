---
id: "@km/flexily/dead-stats"
aliases:
  - km-flexily.dead-stats
  - km-flexily-dead-stats
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:30Z
closed_at: 2026-03-13T05:39:08Z
close_reason: "Fixed: Removed resolveEdgeCalls counter from layout-stats.ts,
  layout-zero.ts, index.ts, index-classic.ts, and classic/layout.ts. It was
  exported and reset but never incremented (no incResolveEdgeCalls function
  existed). Tests still pass (1483/1495)."
---

# [x] DRY: resolveEdgeCalls counter exported but never incremented @km/flexily #task #P2
