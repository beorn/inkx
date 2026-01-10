/**
 * @km/core - Node types, data model, events
 *
 * Re-exports from src/node and src/shared for backwards compatibility
 */

// Types
export type {
  Node,
  NodeType,
  TaskStatus,
  TaskMark,
  Event,
  EventType,
  NodeCreatedData,
  NodeUpdatedData,
  NodeMovedData,
  SessionStartedData,
  SessionMessageData,
  SessionToolCallData,
  SessionEndedData,
  Dependency,
  KmConfig,
} from "../../../src/node/types.ts";

// Event emission
export {
  emit,
  createEmitter,
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
  emitTaskClaimed,
  emitTaskReleased,
  emitTaskCompleted,
  getEventsPath,
  getKmDir,
  setKmDir,
  setEventHub,
  setDatabase,
  clearDatabase,
} from "../../../src/node/emit.ts";

// Tree utilities
export {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
} from "../../../src/shared/tree.ts";

export type { CollapsedAncestor } from "../../../src/shared/tree.ts";
