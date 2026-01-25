/**
 * SQLite Database - state.db management
 *
 * Re-exports db-accepting functions from sub-modules.
 * All code should use Vault domain object (createVault) instead of these functions.
 */

// Database instance management (for internal use and test setup)
export {
  getDbPath,
  getDb,
  closeDb,
  setDb,
  isMemoryMode,
  resetDb,
  runWithDb,
  tryGetContextDb,
} from "./db-instance.ts"

// Re-export db-accepting query functions
export {
  getNode,
  getNodeByIdPrefix,
  getTaskByIdPrefix,
  getNodeByPath,
  getNodesUnderPath,
  getFileWithChildren,
  getNodeContentHash,
  findFileByName,
  findChildByContent,
  resolveNode,
  resolveTask,
  getChildren,
  getChildCount,
  getChildCountsBatch,
  getSubtree,
  getAncestors,
  getTasksByStatus,
  getAllTasks,
  getLinksTo,
  getTasksFiltered,
  getTasksUnderNode,
  getFilteredNodes,
  findProject,
  toFts5Query,
  search,
  searchWithSnippet,
  getLastEventId,
  getAllNodes,
  getNodeCount,
  rowToNode,
} from "./db-queries/index.ts"

export type { SearchResult } from "./db-queries/index.ts"

// Re-export db-accepting query operations
export { executeQuery, queryTasks, queryNodes } from "./query.ts"

export type { QueryAST } from "./query.ts"

// Re-export db-accepting link operations
export {
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
} from "./db-links.ts"

export type { Link } from "./db-links.ts"

// Re-export db-accepting mutation operations
export { moveNode, updateNode, deleteNode, addNode } from "./db-ops.ts"

// Re-export db-accepting event application (internal use)
export { applyEventWithDb } from "./db-events.ts"
