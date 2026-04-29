---
id: "@km/_orphan/remove-index-wrappers"
aliases:
  - km-remove-index-wrappers
created_at: 2026-01-25T08:30:37Z
closed_at: 2026-01-25T10:07:30Z
---

# [x] Remove singleton wrapper exports from index.ts @km/_orphan #task #P1

Remove singleton wrapper exports from packages/@km/storage/src/index.ts.

Exports to REMOVE (lines 4-55):
- All singleton wrapper function exports from db.ts
- getDbPath, getDb, closeDb, setDb, isMemoryMode, resetDb, runWithDb
- applyEvent, getNode, getNodeByIdPrefix, getTaskByIdPrefix
- getNodeByPath, getNodesUnderPath, getFileWithChildren
- getNodeContentHash, findFileByName, findChildByContent
- resolveNode, resolveTask, getChildren, getChildCount
- getChildCountsBatch, getSubtree, getAncestors
- getTasksByStatus, getAllTasks, getLinksTo
- getTasksFiltered, getTasksUnderNode, getFilteredNodes
- findProject, search, searchWithSnippet, toFts5Query
- getLastEventId, getAllNodes, getNodeCount
- addLink, removeLinksFromSource, getOutgoingLinks
- getBacklinks, getBacklinksByName, resolveLinks
- dbApplyEvent, moveNode, updateNode, deleteNode, addNode
- executeQuery, queryTasks, queryNodes (lines 165-170)

Keep exports:
- SCHEMA (for testing)
- createVault, createWatcher (domain objects)
- loadConfig, loadConfigObject (domain objects)
- All testing utilities (createFakeVault, etc.)
- Event emission (emit, emitNodeCreated, etc.)
- Utilities (parseTaskMetadata, extractTags, etc.)

Depends on: @km/_orphan/remove-db-wrappers (must remove from db.ts first)