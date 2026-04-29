---
id: "@km/flexily/classic-dry-divergence"
aliases:
  - km-flexily.classic-dry-divergence
  - km-flexily-classic-dry-divergence
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:58Z
closed_at: 2026-03-13T05:35:26Z
---

# [x] Classic implementation is 2900 LOC duplicate of zero — divergence risk @km/flexily #task #P3

classic/layout.ts (1793 LOC) and classic/node.ts (1121 LOC) are near-complete duplicates of the zero-allocation implementation. They share types.ts, constants.ts, and utils.ts, but duplicate: layout algorithm (~1700 lines), edge resolution (~140 lines), node class (~1100 lines). The classic variant exists for debugging and reentrancy, but maintaining two parallel layout implementations creates divergence risk — any feature or bugfix must be applied to both. Current state: classic/layout.ts still has a getLogicalEdgeValue function duplicated from layout-helpers.ts. Options: (1) Accept divergence risk as the cost of having a debug implementation, (2) Remove classic entirely (it's only used for debugging benchmarks), (3) Auto-generate classic from zero by adding allocation where zero uses pre-alloc. [pro]