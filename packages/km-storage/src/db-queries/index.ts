/**
 * Database Queries - Read-only query functions
 *
 * This module contains all read-only query operations against the database.
 * All functions return KNode objects or arrays of them.
 */

// Utils (rowToNode, getLastEventId, getAllNodes, getNodeCount)
export { rowToNode, getLastEventId, getAllNodes, getNodeCount } from "./utils.ts"

// Core Lookup (getNode*, getNodeByPath, getNodesUnderPath)
export {
  getNode,
  getNodesBatch,
  getNodeByIdPrefix,
  getTaskByIdPrefix,
  getNodeByPath,
  getNodesUnderPath,
  getFileWithChildren,
  getNodeContentHash,
} from "./core-lookup.ts"

// Tree Traversal (getChildren, getSubtree, getAncestors, filtered queries)
export {
  getChildCount,
  getChildCountsBatch,
  getChildren,
  getChildrenByType,
  getBodyChildren,
  getSubitems,
  getSubtree,
  getSubtreeShallow,
  getAncestors,
} from "./tree-traversal.ts"

// Task Queries (getTasksByStatus, getAllTasks, getLinksTo)
export {
  getTasksByStatus,
  getAllTasks,
  getLinksTo,
  getTasksFiltered,
  getTasksUnderNode,
  getFilteredNodes,
  findProject,
} from "./task-queries.ts"

// Wikilink Resolver (findFileByName, findChildByContent)
export { findFileByName, findChildByContent } from "./wikilink-resolver.ts"

// Smart Resolver (resolveNode, resolveTask)
export {
  resolveNode,
  resolveTask,
  clearResolveCache,
  resolveByName,
  clearNameIndex,
  getNameIndex,
} from "./smart-resolver.ts"

// Full-Text Search (search, searchWithSnippet)
export { toFts5Query, search, searchWithSnippet, type SearchResult } from "./full-text-search.ts"
