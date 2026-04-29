---
id: "@km/beads/5-km-beads-implement-queries-module"
aliases:
  - km-beads.5
  - km-beads-5
  - "@km/beads/5"
created_at: 2026-01-21T10:47:53Z
closed_at: 2026-01-21T12:39:20Z
---

# [x] km-beads: Implement queries module @km/beads #task #P2

Create packages/@km/beads/src/queries.ts with:
- queryReady(options) - Unblocked todo issues sorted by priority
- queryIssues(filters) - Filtered issue listing with status/type/priority filters
- isBlocked(nodeId) - Check if issue has unresolved blockers

Depends on: @km/props for blocked-by:: property queries

Create tests in packages/@km/beads/tests/queries.test.ts
