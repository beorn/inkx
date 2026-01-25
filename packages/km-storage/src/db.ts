/**
 * SQLite Database - state.db management
 *
 * Facade module that re-exports from focused sub-modules.
 * This is the primary public API for database access.
 *
 * @deprecated Direct use of these singleton-based functions is deprecated.
 * Use the domain object APIs instead:
 * - createVault() → vault.getNode(), vault.getChildren(), etc.
 * - createWatcher() → watcher.on("change", ...")
 *
 * These functions remain for internal use and backwards compatibility.
 */

import type { KNode } from "@km/core"

// Database instance management
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

// Import getDb for use in wrapper functions
import { getDb } from "./db-instance.ts"

// Import underlying db-accepting functions with different names
import {
  getNode as dbGetNode,
  getNodeByIdPrefix as dbGetNodeByIdPrefix,
  getTaskByIdPrefix as dbGetTaskByIdPrefix,
  getNodeByPath as dbGetNodeByPath,
  getNodesUnderPath as dbGetNodesUnderPath,
  getFileWithChildren as dbGetFileWithChildren,
  getNodeContentHash as dbGetNodeContentHash,
  findFileByName as dbFindFileByName,
  findChildByContent as dbFindChildByContent,
  resolveNode as dbResolveNode,
  resolveTask as dbResolveTask,
  getChildren as dbGetChildren,
  getChildCount as dbGetChildCount,
  getChildCountsBatch as dbGetChildCountsBatch,
  getSubtree as dbGetSubtree,
  getAncestors as dbGetAncestors,
  getTasksByStatus as dbGetTasksByStatus,
  getAllTasks as dbGetAllTasks,
  getLinksTo as dbGetLinksTo,
  getTasksFiltered as dbGetTasksFiltered,
  getTasksUnderNode as dbGetTasksUnderNode,
  getFilteredNodes as dbGetFilteredNodes,
  findProject as dbFindProject,
  toFts5Query as dbToFts5Query,
  search as dbSearch,
  searchWithSnippet as dbSearchWithSnippet,
  getLastEventId as dbGetLastEventId,
  getAllNodes as dbGetAllNodes,
  getNodeCount as dbGetNodeCount,
  rowToNode,
  type SearchResult,
} from "./db-queries/index.ts"

// Singleton wrapper functions (deprecated - use Vault domain object instead)
// These call getDb() internally and delegate to the db-accepting functions

/** @deprecated Use vault.getNode() instead */
export const getNode: typeof dbGetNode = (id) => dbGetNode(getDb(), id)

/** @deprecated Use vault API */
export const getNodeByIdPrefix: typeof dbGetNodeByIdPrefix = (prefix, options) =>
  dbGetNodeByIdPrefix(getDb(), prefix, options)

/** @deprecated Use vault API */
export const getTaskByIdPrefix: typeof dbGetTaskByIdPrefix = (prefix) =>
  dbGetTaskByIdPrefix(getDb(), prefix)

/** @deprecated Use vault API */
export const getNodeByPath: typeof dbGetNodeByPath = (path, options) =>
  dbGetNodeByPath(getDb(), path, options)

/** @deprecated Use vault API */
export const getNodesUnderPath: typeof dbGetNodesUnderPath = (path, options) =>
  dbGetNodesUnderPath(getDb(), path, options)

/** @deprecated Use vault API */
export const getFileWithChildren: typeof dbGetFileWithChildren = (fileId) =>
  dbGetFileWithChildren(getDb(), fileId)

/** @deprecated Use vault API */
export const getNodeContentHash: typeof dbGetNodeContentHash = (id) =>
  dbGetNodeContentHash(getDb(), id)

/** @deprecated Use vault API */
export const findFileByName: typeof dbFindFileByName = (filename) =>
  dbFindFileByName(getDb(), filename)

/** @deprecated Use vault API */
export const findChildByContent: typeof dbFindChildByContent = (parentId, content) =>
  dbFindChildByContent(getDb(), parentId, content)

/** @deprecated Use vault.resolveNode() instead */
export const resolveNode: typeof dbResolveNode = (query, typeOrOptions) =>
  dbResolveNode(getDb(), query, typeOrOptions)

/** @deprecated Use vault API */
export const resolveTask: typeof dbResolveTask = (query) =>
  dbResolveTask(getDb(), query)

/** @deprecated Use vault.getChildren() instead */
export const getChildren: typeof dbGetChildren = (parentId) =>
  dbGetChildren(getDb(), parentId)

/** @deprecated Use vault API */
export const getChildCount: typeof dbGetChildCount = (parentId) =>
  dbGetChildCount(getDb(), parentId)

/** @deprecated Use vault.getChildCounts() instead */
export const getChildCountsBatch: typeof dbGetChildCountsBatch = (parentIds) =>
  dbGetChildCountsBatch(getDb(), parentIds)

/** @deprecated Use vault.getSubtree() instead */
export const getSubtree: typeof dbGetSubtree = (nodeId) =>
  dbGetSubtree(getDb(), nodeId)

/** @deprecated Use vault.getAncestors() instead */
export const getAncestors: typeof dbGetAncestors = (nodeId) =>
  dbGetAncestors(getDb(), nodeId)

/** @deprecated Use vault.getTasksByStatus() instead */
export const getTasksByStatus: typeof dbGetTasksByStatus = (status) =>
  dbGetTasksByStatus(getDb(), status)

/** @deprecated Use vault.getAllTasks() instead */
export const getAllTasks: typeof dbGetAllTasks = () =>
  dbGetAllTasks(getDb())

/** @deprecated Use vault.getLinksTo() instead */
export const getLinksTo: typeof dbGetLinksTo = (nodeId) =>
  dbGetLinksTo(getDb(), nodeId)

/** @deprecated Use vault API */
export const getTasksFiltered: typeof dbGetTasksFiltered = (filter) =>
  dbGetTasksFiltered(getDb(), filter)

/** @deprecated Use vault API */
export const getTasksUnderNode: typeof dbGetTasksUnderNode = (nodeId) =>
  dbGetTasksUnderNode(getDb(), nodeId)

/** @deprecated Use vault API */
export const getFilteredNodes: typeof dbGetFilteredNodes = (filter) =>
  dbGetFilteredNodes(getDb(), filter)

/** @deprecated Use vault API */
export const findProject: typeof dbFindProject = () =>
  dbFindProject(getDb())

/** @deprecated Use vault API */
export const toFts5Query: typeof dbToFts5Query = (query) =>
  dbToFts5Query(query)

/** @deprecated Use vault.search() instead */
export const search: typeof dbSearch = (query) =>
  dbSearch(getDb(), query)

/** @deprecated Use vault API */
export const searchWithSnippet: typeof dbSearchWithSnippet = (query) =>
  dbSearchWithSnippet(getDb(), query)

/** @deprecated Use vault API */
export const getLastEventId: typeof dbGetLastEventId = () =>
  dbGetLastEventId(getDb())

/** @deprecated Use vault API */
export const getAllNodes: typeof dbGetAllNodes = () =>
  dbGetAllNodes(getDb())

/** @deprecated Use vault API */
export const getNodeCount: typeof dbGetNodeCount = () =>
  dbGetNodeCount(getDb())

// Re-export types and utilities
export { rowToNode, type SearchResult }

// Import link operations with different names
import {
  addLink as dbAddLink,
  removeLinksFromSource as dbRemoveLinksFromSource,
  getOutgoingLinks as dbGetOutgoingLinks,
  getBacklinks as dbGetBacklinks,
  getBacklinksByName as dbGetBacklinksByName,
  resolveLinks as dbResolveLinks,
  type Link,
} from "./db-links.ts"

// Import mutation operations with different names
import {
  moveNode as dbMoveNode,
  updateNode as dbUpdateNode,
  deleteNode as dbDeleteNode,
  addNode as dbAddNode,
} from "./db-ops.ts"

// Singleton wrapper functions for link operations

/** @deprecated Use vault API */
export function addLink(link: Omit<Link, "created_at">): void {
  return dbAddLink(getDb(), link)
}

/** @deprecated Use vault API */
export function removeLinksFromSource(sourceId: string): void {
  return dbRemoveLinksFromSource(getDb(), sourceId)
}

/** @deprecated Use vault.getOutgoingLinks() instead */
export function getOutgoingLinks(sourceId: string): Link[] {
  return dbGetOutgoingLinks(getDb(), sourceId)
}

/** @deprecated Use vault.getBacklinks() instead */
export function getBacklinks(targetId: string): Link[] {
  return dbGetBacklinks(getDb(), targetId)
}

/** @deprecated Use vault API */
export function getBacklinksByName(targetName: string): Link[] {
  return dbGetBacklinksByName(getDb(), targetName)
}

/** @deprecated Use vault API */
export function resolveLinks(targetId: string, targetName: string): number {
  return dbResolveLinks(getDb(), targetId, targetName)
}

// Re-export Link type
export type { Link }

// Singleton wrapper functions for mutation operations

/** @deprecated Use vault.moveNode() instead */
export function moveNode(nodeId: string, newParentId: string, position: number): void {
  return dbMoveNode(getDb(), nodeId, newParentId, position)
}

/** @deprecated Use vault.updateNode() instead */
export function updateNode(nodeId: string, updates: Record<string, unknown>): void {
  return dbUpdateNode(getDb(), nodeId, updates)
}

/** @deprecated Use vault.deleteNode() instead */
export function deleteNode(nodeId: string): void {
  return dbDeleteNode(getDb(), nodeId)
}

/** @deprecated Use vault.addNode() instead */
export function addNode(parentId: string | null, node: Partial<KNode>): string {
  return dbAddNode(getDb(), parentId, node)
}

// Singleton wrapper for event application (applyEvent doesn't take db parameter)

/** @deprecated Use vault API */
export { applyEvent } from "./db-events.ts"

// Re-export dbApplyEvent for internal use
export { dbApplyEvent } from "./db-events.ts"
