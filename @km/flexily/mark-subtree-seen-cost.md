---
id: "@km/flexily/mark-subtree-seen-cost"
aliases:
  - km-flexily.mark-subtree-seen-cost
  - km-flexily-mark-subtree-seen-cost
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:29Z
closed_at: 2026-03-13T05:37:57Z
close_reason: Investigated. markSubtreeLayoutSeen clears _isDirty and sets
  _hasNewLayout on all nodes. _isDirty clearing IS needed for fingerprint cache
  correctness. Could be merged into layoutNode end, but risks caching bugs (3
  prior bugs in this area). _hasNewLayout is unused by any consumer (silvery,
  km). Walk is O(n) trivial work (~2 field writes per node), adds <5% overhead
  vs actual layout. Risk exceeds benefit. Deferring.
---

# [x] Perf: markSubtreeLayoutSeen() adds another full-tree walk after every layout @km/flexily #task #P2
