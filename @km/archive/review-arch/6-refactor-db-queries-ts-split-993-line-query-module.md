---
mentions:
  - km
id: "@km/review-arch/6-refactor-db-queries-ts-split-993-line-query-module"
aliases:
  - km-review-arch.6
  - km-review-arch-6
  - "@km/review-arch/6"
created_at: 2026-01-23T09:11:46Z
closed_at: 2026-01-23T09:31:52Z
---

# [x] Refactor db-queries.ts: split 993-line query module @km/review-arch #task #P3

## @km/review-arch/6-refactor-db-queries-ts-split-993-line-query-module: Refactor db-queries.ts

**Scope:** Split 993 lines into 7 modules (each <170 lines)

### New Structure

```
packages/km-storage/src/db-queries/
├── index.ts           # Re-exports all
├── utils.ts           # rowToNode, getLastEventId, getAllNodes, getNodeCount (90 lines)
├── core-lookup.ts     # getNode*, getNodeByPath, getNodesUnderPath (140 lines)
├── tree-traversal.ts  # getChildren, getSubtree, getAncestors (160 lines)
├── task-queries.ts    # getTasksByStatus, getAllTasks, getLinksTo (130 lines)
├── wikilink-resolver.ts # findFileByName, findChildByContent (120 lines)
├── smart-resolver.ts  # resolveNode, resolveTask (135 lines)
└── full-text-search.ts # search, searchWithSnippet (100 lines)
```

### Migration Steps

1. Create db-queries/ directory
2. Extract utils.ts (no dependencies)
3. Extract core-lookup.ts (imports utils)
4. Extract tree-traversal.ts (imports utils)
5. Extract remaining modules
6. Update index.ts to re-export all
7. Delete old db-queries.ts

### Backward Compatibility

All existing imports work via re-exports in index.ts

