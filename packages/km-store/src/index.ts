// Database operations
export {
  getDbPath,
  getDb,
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
  searchWithSnippet,
  toFts5Query,
  getLastEventId,
  getAllNodes,
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
  dbApplyEvent,
} from "./db.ts";

export type { Link, SearchResult } from "./db.ts";

// Store abstraction
export {
  DiskStore,
  MemoryStore,
  initStore,
  getStore,
  closeStore,
} from "./store.ts";

export type { NodeStore } from "./store.ts";

// State rebuild
export {
  readEvents,
  rebuildState,
  needsRebuild,
  syncState,
  fullReset,
  ensureState,
  freshStart,
} from "./rebuild.ts";

// Content-addressable store
export {
  getBlobsPath,
  hashContent,
  storeContent,
  loadContent,
  hasContent,
  shouldStoreInCas,
  storeContentAuto,
  loadContentAuto,
} from "./cas.ts";

// Query language
export {
  parseQuery,
  executeQuery,
  queryTasks,
  queryNodes,
  resolveDateQuery,
} from "./query.ts";

export type { QueryAST, QueryCondition, QueryRef, DateRange } from "./query.ts";
