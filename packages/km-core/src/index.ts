// Types
export type {
  Node,
  NodeType,
  NodeRules,
  TaskStatus,
  TaskMark,
  Event,
  EventType,
  NodeCreatedData,
  NodeUpdatedData,
  NodeMovedData,
} from "./types.ts";

// Constants
export { CUSTOM_TASK_MARKS, TASK_MARK_REGEX_CLASS } from "./types.ts";

// Event emission
export {
  emit,
  setKmDir,
  getKmDir,
  setEventHub,
  setDatabase,
  setFsSync,
  clearDatabase,
  getEventsPath,
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
  emitTaskClaimed,
  emitTaskReleased,
  emitTaskCompleted,
} from "./emit.ts";

// Recurrence utilities
export { parseRRule, getNextOccurrence, naturalToRRule } from "./recurrence.ts";

// Node layer (TUI view models)
// Note: These are deprecated - use @km/tree instead
export type { NodeState, CursorPath } from "./node/index.ts";
export {
  getNodeAtPath,
  getSiblingCount,
  getCurrentIndex,
  collectAllNodeIds,
  getSiblings,
} from "./node/index.ts";

// Board layer: Use @km/board directly for visual navigation state
// The board reducer and types have been consolidated there

// Query language parser (merged from @km/query)
export {
  parseQuery,
  mapFieldName,
  resolveDateQuery,
  isDateShortcut,
  isDateField,
} from "./query/index.ts";
export type {
  QueryAST,
  QueryCondition,
  QueryRef,
  QueryPath,
  QueryOffset,
  QueryText,
  QueryPhrase,
  DateRange,
} from "./query/index.ts";
