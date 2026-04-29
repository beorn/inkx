---
id: "@km/flexily/shared-value-aliasing"
aliases:
  - km-flexily.shared-value-aliasing
  - km-flexily-shared-value-aliasing
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:14Z
closed_at: 2026-03-13T05:32:39Z
close_reason: P4 quality — tracked but not blocking. Value aliasing risk is
  theoretical; no bugs reported from it.
---

# [x] setEdgeValue shares Value object for HORIZONTAL/VERTICAL/ALL edges @km/flexily #task #P4

In utils.ts setEdgeValue(), a single Value object 'v' is created and assigned to multiple array slots for EDGE_HORIZONTAL (left+right), EDGE_VERTICAL (top+bottom), and EDGE_ALL (all 4). This means arr[0] === arr[2] after setPadding(EDGE_HORIZONTAL, 5). Currently safe because Values are never mutated in place -- they're always replaced via setEdgeValue. But this is a latent aliasing hazard: any future code that mutates a Value in-place would corrupt sibling edges silently. Fix: create separate objects per slot. Cost: one extra object allocation per setEdgeValue call with multi-edge constants. [pro]