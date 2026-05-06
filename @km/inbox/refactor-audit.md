---
mentions:
  - km
  - km
id: "@km/inbox/refactor-audit"
aliases:
  - km-refactor-audit
  - "@km/_orphan/refactor-audit"
created_at: 2026-01-24T21:50:57Z
closed_at: 2026-01-24T22:24:58Z
---

# [x] Audit and delete unused @km/board helpers @km/_orphan #task #P3

Audit @km/board exports and delete unused code after refactoring.

**Potentially unused:**

- Selectors: getCurrentNode, getParentNode, getSiblings, getCurrentIndex
- Navigation: canNavigateUp/Down/Parent/Child
- Utilities: isNodeFolded, isNodeCollapsed, getTotalNodeCount
- Others: toBoardViewModel, createNodeMap, visualToStructural, createBoard

**Process:**

1. Grep for usage of each export across apps/ and packages/
2. For unused exports, check if tests use them
3. Delete unused code (or mark as internal if test-only)
4. Update index.ts exports

**Dependencies:**

- Blocked by: @km/_orphan/refactor-legacy

