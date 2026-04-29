---
id: "@km/flexily/unconditional-date-countNodes"
aliases:
  - km-flexily.unconditional-date-countNodes
  - km-flexily-unconditional-date-countNodes
created_by: claude:65d845d9
created_at: 2026-03-13T05:33:30Z
closed_at: 2026-03-13T05:34:56Z
---

# [x] calculateLayout unconditionally calls Date.now() and countNodes() even when logging disabled @km/flexily #task #P3

node-zero.ts calculateLayout() (lines 602-603) calls Date.now() and countNodes(this) on every layout pass, but these values are only used in the debug log (line 616) which is behind optional chaining (log.debug?.()). countNodes() traverses the entire tree with O(n) cost. Both should be guarded by log.debug (only execute if logging is enabled). Fix: move Date.now() and countNodes() inside the log.debug block, or conditionally call them: 'const start = log.debug ? Date.now() : 0'. Performance impact: saves one full tree traversal per layout pass when logging is disabled (which is always in production). [pro]