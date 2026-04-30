---
id: "@km/inbox/remove-db-wrappers"
aliases:
  - km-remove-db-wrappers
  - "@km/_orphan/remove-db-wrappers"
created_at: 2026-01-25T08:30:36Z
closed_at: 2026-01-25T10:07:25Z
---

# [x] Remove singleton wrapper functions from db.ts @km/_orphan #task #P1

Remove all ~40 singleton wrapper functions from packages/@km/storage/src/db.ts.

Functions to REMOVE:
- getNode, getNodeByIdPrefix, getTaskByIdPrefix
- getNodeByPath, getNodesUnderPath, getFileWithChildren
- getNodeContentHash, findFileByName, findChildByContent
- resolveNode, resolveTask
- getChildren, getChildCount, getChildCountsBatch
- getSubtree, getAncestors
- getTasksByStatus, getAllTasks, getLinksTo
- getTasksFiltered, getTasksUnderNode, getFilteredNodes
- findProject, toFts5Query, search, searchWithSnippet
- getLastEventId, getAllNodes, getNodeCount
- executeQuery, queryTasks, queryNodes
- addLink, removeLinksFromSource, getOutgoingLinks
- getBacklinks, getBacklinksByName, resolveLinks
- moveNode, updateNode, deleteNode, addNode
- applyEvent

These are all marked @deprecated and call getDb() internally.

After removal, db.ts should only contain:
1. Database instance management (getDb, setDb, closeDb, etc.)
2. Import/re-export of db-accepting functions for internal use

Depends on: @km/_orphan/cli-tasks-vault, @km/_orphan/cli-main-vault, @km/_orphan/agent-vault (must convert callers first)