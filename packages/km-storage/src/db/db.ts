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
} from "./queries/index.ts"

export type { SearchResult } from "./queries/index.ts"

// Re-export db-accepting query operations
export { executeQuery, queryTasks, queryNodes } from "../query.ts"

export type { QueryAST } from "../query.ts"

// Re-export db-accepting link operations
export {
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
} from "./links.ts"

export type { Link } from "./links.ts"

// Re-export db-accepting mutation operations
export { createDbOps, type DbOps, buildSymlinkChild, type SymlinkChildOpts } from "./ops.ts"

// Re-export db-accepting change application (internal use)
export { applyChangeWithDb } from "./changes.ts"
