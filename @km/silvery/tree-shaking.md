---
id: "@km/silvery/tree-shaking"
aliases:
  - km-silvery.tree-shaking
  - km-silvery-tree-shaking
created_by: claude:474834b0
created_at: 2026-03-09T21:49:48Z
closed_at: 2026-03-10T01:22:53Z
close_reason: "Made @silvery/term barrel React-free: 798KB→379KB. Extracted
  hit-registry-core.ts (pure logic), measure-stats.ts, errors.ts. Removed React
  hooks from barrel. All 14 entry points pass tree-shaking verification."
---

# [x] Tree-shaking verification for layered entry points @km/silvery #task #P3 @claude:474834b0

Verify that silvery's 17 layered entry points tree-shake correctly. Importing silvery/runtime should not pull in React, etc.