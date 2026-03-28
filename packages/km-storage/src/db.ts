/**
 * SQLite Database - state.db management
 *
 * Re-exports db-accepting functions from sub-modules.
 * All code should use Repo domain object (createRepo) instead of these functions.
 */

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
  getNameIndex,
  getChildren,
  getChildrenByType,
  getBodyChildren,
  getSubitems,
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
export { createDbOps, type DbOps, buildEmbedChild, type EmbedChildOpts } from "./db-ops.ts"

// Re-export db-accepting event application (internal use)
export { applyEventWithDb } from "./db-events.ts"
