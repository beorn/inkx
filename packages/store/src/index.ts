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
} from "../../../src/node/db.ts";

// CAS (content-addressable storage)
export { hashContent, storeContent, getContent } from "../../../src/node/cas.ts";

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
export { initStore, MemoryStore } from "../../../src/node/store.ts";
export type { Store, StoreMode } from "../../../src/node/store.ts";
