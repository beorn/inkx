/**
 * @km/store - Database and state management
 *
 * Re-exports from src/node for backwards compatibility
 */

// Database
export {
  getDb,
  getDbPath,
  closeDb,
  setDb,
  isMemoryMode,
  resetDb,
  applyEvent,
  getNode,
  getNodeByIdPrefix,
  getNodeByPath,
  getChildren,
  getSubtree,
  getAncestors,
  getTasksByStatus,
  getAllTasks,
  search,
  getLastEventId,
  getAllNodes,
  dbApplyEvent,
  // Link management
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
} from "../../../src/node/db.ts";
export type { Link } from "../../../src/node/db.ts";

// CAS (content-addressable storage)
export {
  hashContent,
  storeContent,
  loadContent,
  hasContent,
  storeContentAuto,
  loadContentAuto,
} from "../../../src/node/cas.ts";

// Rebuild
export {
  readEvents,
  rebuildState,
  needsRebuild,
  syncState,
  fullReset,
  ensureState,
  freshStart,
} from "../../../src/node/rebuild.ts";

// Store abstraction
export { initStore, MemoryStore, DiskStore, getStore, closeStore } from "../../../src/node/store.ts";
export type { NodeStore } from "../../../src/node/store.ts";
