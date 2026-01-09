/**
 * Node module - Data model layer
 *
 * Re-exports all node-related functionality
 */

// Types
export type {
  NodeType,
  TaskStatus,
  Node,
  EventType,
  Event,
  SessionStartData,
  SessionMessageData,
  SessionToolCallData,
  SessionEndData,
} from "./types.ts";

// Event emission
export {
  emit,
  getKmPath,
  setKmPath,
  getEventsPath,
  setEventHub,
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
  emitTaskClaimed,
  emitTaskReleased,
  emitTaskCompleted,
} from "./emit.ts";

// Database
export {
  getDb,
  getDbPath,
  closeDb,
  resetDb,
  applyEvent,
  getNode,
  getNodeByPath,
  getChildren,
  getSubtree,
  getTasksByStatus,
  getAllTasks,
  getAllNodes,
  search,
  getLastEventId,
} from "./db.ts";

// Content-Addressable Store
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

// Rebuild
export {
  readEvents,
  rebuildState,
  needsRebuild,
  syncState,
  fullReset,
  freshStart,
  ensureState,
} from "./rebuild.ts";
