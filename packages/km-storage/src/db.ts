/**
 * SQLite Database - state.db management
 *
 * Facade module that re-exports from focused sub-modules.
 * This is the primary public API for database access.
 *
 * @deprecated Direct use of these singleton-based functions is deprecated.
 * Use the domain object APIs instead:
 * - createVault() → vault.getNode(), vault.getChildren(), etc.
 * - createWatcher() → watcher.on("change", ...)
 *
 * These functions remain for internal use and backwards compatibility.
 */

// Database instance management
export {
  getDbPath,
  getDb,
  closeDb,
  setDb,
  isMemoryMode,
  resetDb,
} from "./db-instance.ts";

// Read-only queries
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
  type SearchResult,
} from "./db-queries/index.ts";

// Link management
export {
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
  type Link,
} from "./db-links.ts";

// Write operations
export { moveNode, updateNode, deleteNode, addNode } from "./db-ops.ts";

// Event application
export { applyEvent, dbApplyEvent } from "./db-events.ts";
