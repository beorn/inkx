/**
 * SQLite Database - state.db management
 *
 * This file re-exports from focused modules for backwards compatibility.
 * New code should import directly from the specific modules:
 * - db-instance.ts: Database connection management
 * - db-queries.ts: Read-only query functions
 * - db-links.ts: Link management
 * - db-ops.ts: Write operations
 * - db-events.ts: Event application
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
} from "./db-queries.ts";

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
