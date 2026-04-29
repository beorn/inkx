---
id: "@km/flexily/count-nodes-unconditional"
aliases:
  - km-flexily.count-nodes-unconditional
  - km-flexily-count-nodes-unconditional
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:47Z
closed_at: 2026-03-13T05:42:53Z
close_reason: "Fixed: Made countNodes() and Date.now() conditional on log.debug
  being enabled. Zero-cost in production."
---

# [x] Perf: countNodes() runs unconditionally on every layout — O(n) debug tax @km/flexily #bug #P1
