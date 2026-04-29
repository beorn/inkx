---
id: "@km/_orphan/9qic"
aliases:
  - km-9qic
created_at: 2026-01-20T14:25:51Z
closed_at: 2026-01-20T14:36:55Z
---

# [x] inkx: Over-exported reconciler internals @km/_orphan #task #P2

Medium: reconciler/index.ts:18-27 exports internal helpers like LAYOUT_PROPS, calculateLayout, createNode that are only used within reconciler. Prune to avoid API surface bloat and users depending on internals.